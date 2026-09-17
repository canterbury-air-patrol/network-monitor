"""Telemetry replay tool [P12-05].

Replays a captured session (see ``capture_telemetry``) into a deployment, in
order and with the recorded gaps between snapshots preserved. Nothing is
generated and nothing is random: the same file replayed twice drives the system
with identical input, which is what makes a field fault reproducible at a desk.

Examples::

    # Fast-forward a session into the database
    docker compose exec app ./manage.py replay_telemetry session.json

    # Drive a running dev server through the ingest API at the recorded pace
    docker compose exec app ./manage.py replay_telemetry session.json \\
        --transport http --realtime

    # Replay only the 90 seconds around the fault, ten times faster
    docker compose exec app ./manage.py replay_telemetry session.json \\
        --from-offset 240 --to-offset 330 --realtime --speed-factor 10
"""

from __future__ import annotations

import dataclasses
import datetime
import json
import math
import pathlib
import time

from django.contrib.gis.geos import Point
from django.core.exceptions import MultipleObjectsReturned
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from data.models import GroundStation, Node, Radio
from data.replay import Session, SessionError, snapshot_to_payload
from data.telemetry_transport import DEFAULT_INGEST_URL, TRANSPORT_CHOICES, TransportError, build_transport


class Command(BaseCommand):
    help = "Replay a captured telemetry session from a JSON file."

    def add_arguments(self, parser):
        parser.add_argument("session", help="Path to a session JSON document.")
        parser.add_argument(
            "--transport",
            choices=list(TRANSPORT_CHOICES),
            default="orm",
            help="Where to send snapshots: straight to the database, to the ingest API, or to stdout.",
        )
        parser.add_argument("--url", default=DEFAULT_INGEST_URL, help="Ingest endpoint for --transport http.")
        parser.add_argument("--token", help="Bearer token sent with --transport http requests.")
        parser.add_argument(
            "--no-bootstrap",
            dest="bootstrap",
            action="store_false",
            help="Do not create missing Node/Radio/GroundStation rows; fail if they are absent.",
        )
        parser.add_argument("--from-offset", type=float, help="Skip snapshots before this offset (seconds).")
        parser.add_argument("--to-offset", type=float, help="Skip snapshots after this offset (seconds).")
        parser.add_argument(
            "--realtime",
            action="store_true",
            help="Sleep between snapshots so the recorded gaps play back at wall-clock pace.",
        )
        parser.add_argument(
            "--speed-factor",
            type=float,
            default=1.0,
            help="Multiplier for --realtime pacing (2.0 replays twice as fast). Capture times are compressed "
            "to match, so they keep pace with the wall clock.",
        )
        parser.add_argument(
            "--start-time",
            help="ISO-8601 capture time for the first replayed snapshot; defaults to now (or far enough in "
            "the past that the session ends now when fast-forwarding).",
        )
        parser.add_argument(
            "--preserve-timestamps",
            action="store_true",
            help="Send the original capture times instead of rebasing onto now. The ingest API rejects stale "
            "timestamps, so this is for --transport orm.",
        )
        # One snapshot per request is how a device reports, so that is the
        # default; batching is for getting a long session in quickly.
        parser.add_argument("--batch-size", type=int, default=1, help="Snapshots per ingest request or transaction.")
        parser.add_argument(
            "--dry-run", action="store_true", help="Validate the session and report what would be sent."
        )

    def handle(self, *args, **options):
        self._validate(options)
        session = self._window(self._load(options["session"]), options)

        if options["dry_run"]:
            self._describe(session, options)
            return

        ids = self._resolve_ids(session, bootstrap=options["bootstrap"])
        transport = build_transport(options["transport"], url=options["url"], token=options["token"])
        if options["preserve_timestamps"] and options["transport"] == "http":
            self.stderr.write(
                self.style.WARNING(
                    "--preserve-timestamps sends the original capture times; the ingest API will reject any "
                    "older than TELEMETRY_MAX_AGE_HOURS. Use --transport orm to replay an old session."
                )
            )

        # A sped-up realtime replay has to compress the capture times with it:
        # stamping the recorded gaps onto a clock running ten times slower would
        # march the session into the future, which the ingest API rejects as
        # FUTURE_TIMESTAMP and the map reads as telemetry that has not happened.
        scale = 1 / options["speed_factor"] if options["realtime"] else 1.0
        pairs = (
            session.original_timeline()
            if options["preserve_timestamps"]
            else session.timeline(self._start_time(session, options), scale=scale)
        )

        batch: list[dict] = []
        sent = 0
        readings = 0
        first_offset = session.snapshots[0].offset_s
        started = time.monotonic()
        for snapshot, captured_at in pairs:
            if options["realtime"]:
                # Paced off the recorded offsets rather than a fixed interval:
                # an irregular reporting rate is often the bug.
                due = started + (snapshot.offset_s - first_offset) / options["speed_factor"]
                delay = due - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
            batch.append(
                snapshot_to_payload(
                    snapshot,
                    captured_at,
                    node_ids=ids.nodes,
                    radio_ids=ids.radios,
                    station_ids=ids.stations,
                )
            )
            readings += len(snapshot.readings)
            if len(batch) >= options["batch_size"]:
                sent += self._send(transport, batch)
                batch = []
        if batch:
            sent += self._send(transport, batch)

        self.stdout.write(
            self.style.SUCCESS(
                f"{session.name}: replayed {sent} snapshot(s) with {readings} reading(s) via {options['transport']}"
            )
        )

    # --- session loading --------------------------------------------------

    def _load(self, source: str) -> Session:
        path = pathlib.Path(source)
        try:
            document = json.loads(path.read_text())
        except OSError as exc:
            raise CommandError(f"Cannot read session {path}: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise CommandError(f"Session {path} is not valid JSON: {exc}") from exc
        try:
            return Session.from_dict(document)
        except SessionError as exc:
            raise CommandError(f"Session {path} is invalid: {exc}") from exc

    def _window(self, session: Session, options) -> Session:
        if options["from_offset"] is None and options["to_offset"] is None:
            return session
        try:
            return session.window(options["from_offset"], options["to_offset"])
        except SessionError as exc:
            raise CommandError(str(exc)) from exc

    def _validate(self, options) -> None:
        # ``float("nan")`` compares false against every bound below, so a
        # non-finite value would slip past the checks and then quietly
        # misbehave: a nan speed factor paces off nan deadlines, and a nan
        # offset matches no snapshot at all.
        for name in ("speed_factor", "from_offset", "to_offset"):
            value = options[name]
            if value is not None and not math.isfinite(value):
                raise CommandError(f"--{name.replace('_', '-')} must be a finite number")
        if options["batch_size"] < 1:
            raise CommandError("--batch-size must be at least 1")
        if options["speed_factor"] <= 0:
            raise CommandError("--speed-factor must be greater than zero")
        if options["preserve_timestamps"] and options["start_time"]:
            raise CommandError("--preserve-timestamps and --start-time set the same thing; use one or the other")

    def _start_time(self, session: Session, options) -> datetime.datetime:
        raw = options["start_time"]
        if raw:
            try:
                parsed = datetime.datetime.fromisoformat(raw)
            except ValueError as exc:
                raise CommandError(f"--start-time is not a valid ISO-8601 timestamp: {raw}") from exc
            return parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)
        now = timezone.now()
        if options["realtime"]:
            return now
        # Fast-forwarding would otherwise stamp the whole session in the future,
        # which the ingest serializer rejects; land the last snapshot on now.
        return now - datetime.timedelta(seconds=session.duration_s)

    # --- entity resolution ------------------------------------------------

    def _resolve_ids(self, session: Session, *, bootstrap: bool) -> "_Ids":
        if bootstrap:
            return self._bootstrap(session)
        nodes: dict[str, int] = {}
        radios: dict[tuple[str, str], int] = {}
        stations: dict[str, int] = {}
        try:
            for spec in session.nodes:
                node = Node.objects.get(name=spec.name)
                nodes[spec.name] = node.pk
                for radio_spec in spec.radios:
                    radios[(spec.name, radio_spec.radio_type)] = Radio.objects.get(
                        node=node, radio_type=radio_spec.radio_type
                    ).pk
            for station_spec in session.ground_stations:
                stations[station_spec.name] = GroundStation.objects.get(name=station_spec.name).pk
        except (Node.DoesNotExist, Radio.DoesNotExist, GroundStation.DoesNotExist) as exc:
            raise CommandError(f"Session entity missing and --no-bootstrap was given: {exc}") from exc
        except MultipleObjectsReturned as exc:
            raise CommandError(_AMBIGUOUS_NODE) from exc
        return _Ids(nodes=nodes, radios=radios, stations=stations)

    @transaction.atomic
    def _bootstrap(self, session: Session) -> "_Ids":
        nodes: dict[str, int] = {}
        radios: dict[tuple[str, str], int] = {}
        stations: dict[str, int] = {}
        for spec in session.nodes:
            try:
                node, _ = Node.objects.get_or_create(name=spec.name)
            except MultipleObjectsReturned as exc:
                raise CommandError(_AMBIGUOUS_NODE) from exc
            nodes[spec.name] = node.pk
            for radio_spec in spec.radios:
                radio, created = Radio.objects.get_or_create(
                    node=node, radio_type=radio_spec.radio_type, defaults={"bands": list(radio_spec.bands)}
                )
                missing = [band for band in radio_spec.bands if band not in radio.bands]
                if missing and not created:
                    # The local radio may predate the session; widen it rather
                    # than replaying readings the ingest API calls UNKNOWN_BAND.
                    radio.bands = list(radio.bands) + missing
                    radio.save(update_fields=["bands"])
                radios[(spec.name, radio_spec.radio_type)] = radio.pk
        for station_spec in session.ground_stations:
            position = Point(
                station_spec.position.longitude,
                station_spec.position.latitude,
                station_spec.position.altitude,
                srid=4326,
            )
            station, _ = GroundStation.objects.get_or_create(name=station_spec.name, defaults={"position": position})
            stations[station_spec.name] = station.pk
        return _Ids(nodes=nodes, radios=radios, stations=stations)

    # --- output -----------------------------------------------------------

    def _send(self, transport, batch: list[dict]) -> int:
        try:
            return transport.send(batch)
        except TransportError as exc:
            raise CommandError(str(exc)) from exc

    def _describe(self, session: Session, options) -> None:
        write = self.stdout.write
        write(f"{session.name}")
        write(f"  recorded     {session.recorded_at.isoformat()}")
        write(
            f"  snapshots    {len(session.snapshots)} over {session.duration_s:.1f} s "
            f"({session.reading_count} reading(s))"
        )
        write(f"  nodes        {', '.join(node.name for node in session.nodes)}")
        stations = ", ".join(station.name for station in session.ground_stations) or "none"
        write(f"  stations     {stations}")
        missing = self._missing_entities(session)
        if missing:
            action = "would be created" if options["bootstrap"] else "are missing (--no-bootstrap would fail)"
            write(self.style.WARNING(f"  {len(missing)} entity/entities {action}: {', '.join(missing)}"))
        else:
            write("  entities     all present")
        write(f"  would send   via {options['transport']} in batches of {options['batch_size']}")

    def _missing_entities(self, session: Session) -> list[str]:
        missing = []
        names = [node.name for node in session.nodes]
        known_nodes = dict(Node.objects.filter(name__in=names).values_list("name", "pk"))
        for spec in session.nodes:
            node_id = known_nodes.get(spec.name)
            if node_id is None:
                missing.append(f"node '{spec.name}'")
                missing.extend(f"radio '{spec.name}/{radio.radio_type}'" for radio in spec.radios)
                continue
            present = set(Radio.objects.filter(node_id=node_id).values_list("radio_type", flat=True))
            missing.extend(
                f"radio '{spec.name}/{radio.radio_type}'" for radio in spec.radios if radio.radio_type not in present
            )
        known_stations = set(
            GroundStation.objects.filter(name__in=[s.name for s in session.ground_stations]).values_list(
                "name", flat=True
            )
        )
        missing.extend(
            f"ground station '{station.name}'"
            for station in session.ground_stations
            if station.name not in known_stations
        )
        return missing


# Node.name carries no unique constraint, so a target database can hold two
# nodes a session cannot tell apart.
_AMBIGUOUS_NODE = (
    "More than one node in this database shares a name used by the session; a session identifies nodes by "
    "name, so the replay would land on an arbitrary one. Resolve the duplicate names first."
)


@dataclasses.dataclass
class _Ids:
    """Primary keys the session's names resolve to in this database."""

    nodes: dict[str, int]
    radios: dict[tuple[str, str], int]
    stations: dict[str, int]
