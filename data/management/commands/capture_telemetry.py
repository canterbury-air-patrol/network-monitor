"""Telemetry session capture [P12-05].

Exports recorded telemetry — snapshots, their radio readings and the entities
they refer to — as a session JSON document that ``replay_telemetry`` can play
back into any deployment. This is the half of the replay tool that runs where
the bug happened: an operator captures the window around a fault and hands the
file over, and the developer reproduces it without the field hardware.

Examples::

    # The last hour of everything, to a file
    docker compose exec app ./manage.py capture_telemetry \\
        --since 2026-09-17T09:00:00+12:00 --output session.json

    # One UAV's part of a mission
    docker compose exec app ./manage.py capture_telemetry \\
        --mission 4 --node uav-01 --output mission-4-uav-01.json
"""

from __future__ import annotations

import datetime
import json
import pathlib
import sys

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Max, Min, Prefetch
from django.utils import timezone

from data.models import GroundStation, Mission, MissionPhase, Node, NodeSnapshot, Radio, RadioReading
from data.replay import SESSION_VERSION, NodeSpec, Session, SessionError, SessionReading, SessionSnapshot
from data.simulation import GroundStationSpec, Position, RadioSpec

# Offsets are seconds; a millisecond is finer than any telemetry interval and
# keeps the JSON readable.
_OFFSET_PRECISION = 3


class Command(BaseCommand):
    help = "Export recorded telemetry as a replayable session JSON document."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output", default="-", help="File to write the session to; '-' (the default) writes to stdout."
        )
        parser.add_argument(
            "--node",
            action="append",
            dest="nodes",
            metavar="NAME",
            help="Restrict the capture to this node; repeat for several.",
        )
        parser.add_argument("--since", help="Only snapshots captured at or after this ISO-8601 timestamp.")
        parser.add_argument("--until", help="Only snapshots captured at or before this ISO-8601 timestamp.")
        parser.add_argument(
            "--mission",
            type=int,
            help="Capture the window covered by this mission's phases; combines with --since/--until.",
        )
        parser.add_argument("--limit", type=int, default=0, help="Keep at most this many snapshots (0 for no limit).")
        parser.add_argument("--name", help="Name recorded in the session document.")
        parser.add_argument("--indent", type=int, default=2, help="JSON indentation; 0 writes one dense line.")

    def handle(self, *args, **options):
        since = self._timestamp(options["since"], "--since")
        until = self._timestamp(options["until"], "--until")
        if options["mission"] is not None:
            since, until = self._apply_mission_window(options["mission"], since, until)
        if since is not None and until is not None and since > until:
            raise CommandError("--since must not be later than --until")
        if options["limit"] < 0:
            raise CommandError("--limit cannot be negative")

        snapshots = self._select(options["nodes"], since, until, options["limit"])
        if not snapshots:
            raise CommandError("No snapshots matched the given filters; nothing to capture.")

        session = self._build_session(snapshots, options, since, until)
        self._write(session, options)

        # With the document on stdout, the summary has to go somewhere else:
        # `capture_telemetry > session.json` must produce a file that parses.
        report = self.stderr if options["output"] == "-" else self.stdout
        report.write(
            self.style.SUCCESS(
                f"Captured {len(session.snapshots)} snapshot(s) with {session.reading_count} reading(s) "
                f"over {session.duration_s:.1f} s from {len(session.nodes)} node(s)"
            )
        )

    # --- selection --------------------------------------------------------

    def _timestamp(self, raw: str | None, label: str) -> datetime.datetime | None:
        if not raw:
            return None
        try:
            parsed = datetime.datetime.fromisoformat(raw)
        except ValueError as exc:
            raise CommandError(f"{label} is not a valid ISO-8601 timestamp: {raw}") from exc
        return parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)

    def _apply_mission_window(
        self, mission_id: int, since: datetime.datetime | None, until: datetime.datetime | None
    ) -> tuple[datetime.datetime | None, datetime.datetime | None]:
        """Narrow the window to the span this mission's phases cover.

        Snapshots belong to a phase by timestamp ([P3-13]), so a mission's
        telemetry is whatever falls between its first phase starting and its
        last one closing; a mission still running is open-ended.
        """
        if not Mission.objects.filter(pk=mission_id).exists():
            raise CommandError(f"Mission {mission_id} does not exist")
        phases = MissionPhase.objects.filter(mission_id=mission_id, started_at__isnull=False)
        bounds = phases.aggregate(first=Min("started_at"), last=Max("ended_at"))
        if bounds["first"] is None:
            raise CommandError(f"Mission {mission_id} has no phases that were ever activated")
        started = bounds["first"]
        # An open phase means the mission is still running: leave the end of the
        # window wherever --until put it.
        ended = None if phases.filter(ended_at__isnull=True).exists() else bounds["last"]
        since = started if since is None else max(since, started)
        if ended is not None:
            until = ended if until is None else min(until, ended)
        return since, until

    def _select(
        self,
        node_names: list[str] | None,
        since: datetime.datetime | None,
        until: datetime.datetime | None,
        limit: int,
    ) -> list[NodeSnapshot]:
        # Readings are prefetched in a fixed order: two captures of the same
        # window have to produce the same document, byte for byte.
        queryset = NodeSnapshot.objects.select_related("node").prefetch_related(
            Prefetch(
                "radio_readings",
                queryset=RadioReading.objects.select_related("radio", "ground_station", "relay_node").order_by("id"),
            )
        )
        if node_names:
            known = set(Node.objects.filter(name__in=node_names).values_list("name", flat=True))
            missing = sorted(set(node_names) - known)
            if missing:
                raise CommandError(f"Unknown node(s): {', '.join(missing)}")
            queryset = queryset.filter(node__name__in=node_names)
        if since is not None:
            queryset = queryset.filter(captured_at__gte=since)
        if until is not None:
            queryset = queryset.filter(captured_at__lte=until)
        # Ties on captured_at are broken by insertion order so a capture of the
        # same window is always the same document.
        queryset = queryset.order_by("captured_at", "id")
        if limit:
            queryset = queryset[:limit]
        return list(queryset)

    # --- document assembly ------------------------------------------------

    def _build_session(self, snapshots: list[NodeSnapshot], options, since, until) -> Session:
        recorded_at = snapshots[0].captured_at

        node_names = {snapshot.node.name for snapshot in snapshots}
        station_names = set()
        for snapshot in snapshots:
            for reading in snapshot.radio_readings.all():
                # A session names a radio by its type on the reporting node, so
                # a reading pointing at some other node's radio — nothing stops
                # an ingest from writing one — has no faithful representation.
                if reading.radio.node_id != snapshot.node_id:
                    raise CommandError(
                        f"Snapshot {snapshot.pk} has a reading on radio {reading.radio_id}, which belongs to "
                        f"'{reading.radio.node}' rather than to '{snapshot.node}'; this cannot be captured."
                    )
                if reading.ground_station_id is not None:
                    station_names.add(reading.ground_station.name)
                if reading.relay_node_id is not None:
                    # A relay's own snapshots may fall outside the window, but
                    # the row still has to exist for the replay to reference it.
                    node_names.add(reading.relay_node.name)

        session_snapshots = tuple(
            SessionSnapshot(
                node=snapshot.node.name,
                offset_s=round((snapshot.captured_at - recorded_at).total_seconds(), _OFFSET_PRECISION),
                position=Position(snapshot.position.x, snapshot.position.y, snapshot.position.z),
                readings=tuple(
                    SessionReading(
                        radio_type=reading.radio.radio_type,
                        band=reading.band,
                        rssi_dbm=reading.rssi_dbm,
                        ground_station=reading.ground_station.name if reading.ground_station_id else None,
                        relay_node=reading.relay_node.name if reading.relay_node_id else None,
                        snr_db=reading.snr_db,
                    )
                    for reading in snapshot.radio_readings.all()
                ),
            )
            for snapshot in snapshots
        )

        name = options["name"] or f"capture of {len(snapshots)} snapshot(s) from {recorded_at.isoformat()}"
        return Session(
            name=name,
            recorded_at=recorded_at,
            nodes=self._node_specs(node_names),
            ground_stations=self._station_specs(station_names),
            snapshots=session_snapshots,
            source=self._provenance(options, since, until),
        )

    def _node_specs(self, names: set[str]) -> tuple[NodeSpec, ...]:
        """Every radio of every node involved, so the replay can recreate them.

        Radios the captured window never used are kept: a node that replays with
        half its radios is not the node the bug happened on.
        """
        # Node.name is not unique in the database, but it is the only handle a
        # session has: two nodes sharing one would merge into a single entry and
        # replay onto whichever row came back first.
        counts: dict[str, int] = {}
        for name in Node.objects.filter(name__in=names).values_list("name", flat=True):
            counts[name] = counts.get(name, 0) + 1
        ambiguous = sorted(name for name, count in counts.items() if count > 1)
        if ambiguous:
            raise CommandError(
                f"More than one node is named {', '.join(repr(name) for name in ambiguous)}; a session identifies "
                "nodes by name, so this window cannot be captured until the duplicates are resolved."
            )

        radios: dict[str, list[RadioSpec]] = {name: [] for name in names}
        for radio in Radio.objects.filter(node__name__in=names).select_related("node").order_by("node__name", "id"):
            radios[radio.node.name].append(RadioSpec(radio_type=radio.radio_type, bands=tuple(radio.bands)))
        return tuple(NodeSpec(name=name, radios=tuple(radios[name])) for name in sorted(names))

    def _station_specs(self, names: set[str]) -> tuple[GroundStationSpec, ...]:
        stations = GroundStation.objects.filter(name__in=names).order_by("name")
        return tuple(
            GroundStationSpec(
                name=station.name,
                position=Position(station.position.x, station.position.y, station.position.z),
            )
            for station in stations
        )

    def _provenance(self, options, since, until) -> dict:
        return {
            "command": "capture_telemetry",
            "exported_at": timezone.now().isoformat(),
            "format_version": SESSION_VERSION,
            "filters": {
                "nodes": sorted(options["nodes"]) if options["nodes"] else None,
                "mission": options["mission"],
                "since": since.isoformat() if since else None,
                "until": until.isoformat() if until else None,
                "limit": options["limit"] or None,
            },
        }

    # --- output -----------------------------------------------------------

    def _write(self, session: Session, options) -> None:
        document_data = session.as_dict()
        # Cheap insurance that the file is replayable: the loader is the only
        # authority on that, so run it here rather than leaving the operator to
        # discover the problem when they try to reproduce the fault.
        try:
            Session.from_dict(document_data)
        except SessionError as exc:
            raise CommandError(f"The captured window cannot be represented as a replayable session: {exc}") from exc
        indent = options["indent"] if options["indent"] > 0 else None
        document = json.dumps(document_data, indent=indent)
        destination = options["output"]
        if destination == "-":
            sys.stdout.write(document + "\n")
            sys.stdout.flush()
            return
        path = pathlib.Path(destination)
        try:
            path.write_text(document + "\n")
        except OSError as exc:
            raise CommandError(f"Cannot write session to {path}: {exc}") from exc
        self.stdout.write(f"Wrote {path}")
