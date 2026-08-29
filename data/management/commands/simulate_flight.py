"""Flight path simulator management command [P3-15].

Drives the telemetry ingest path with a synthetic UAV flight so the map,
heatmap and (later) coverage-gap alerts can be exercised without hardware.

Examples::

    # Fast-forward a demo flight straight into the database
    docker compose exec app ./manage.py simulate_flight --demo

    # Feed a running dev server over HTTP, in real time
    docker compose exec app ./manage.py simulate_flight \\
        --scenario data/scenarios/demo_flight.json --transport http --realtime

    # Emit the ingest payloads on stdout for an external test harness
    ./manage.py simulate_flight --demo --transport stdout --no-bootstrap
"""

from __future__ import annotations

import dataclasses
import datetime
import json
import pathlib
import random
import sys
import time
import urllib.error
import urllib.request

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from data.models import GroundStation, Node, NodeSnapshot, Radio, RadioReading
from data.simulation import Scenario, ScenarioError, simulate, snapshot_to_payload

DEMO_SCENARIO = pathlib.Path(__file__).resolve().parents[2] / "scenarios" / "demo_flight.json"
DEFAULT_INGEST_URL = "http://localhost:8050/api/v1/telemetry/ingest/"


class Command(BaseCommand):
    help = "Simulate a UAV flight path, generating snapshots and RadioReading values."

    def add_arguments(self, parser):
        source = parser.add_mutually_exclusive_group(required=True)
        source.add_argument("--scenario", help="Path to a scenario JSON document.")
        source.add_argument(
            "--demo", action="store_true", help=f"Use the bundled demo scenario ({DEMO_SCENARIO.name})."
        )
        parser.add_argument(
            "--transport",
            choices=["orm", "http", "stdout"],
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
        parser.add_argument("--loops", type=int, default=1, help="Repeat the flight path this many times.")
        parser.add_argument("--seed", type=int, help="Override the scenario's RNG seed.")
        parser.add_argument(
            "--realtime",
            action="store_true",
            help="Sleep between samples so telemetry arrives at wall-clock pace.",
        )
        parser.add_argument(
            "--speed-factor",
            type=float,
            default=1.0,
            help="Multiplier for --realtime pacing (2.0 runs the flight twice as fast).",
        )
        parser.add_argument("--batch-size", type=int, default=1, help="Snapshots per ingest request or transaction.")
        parser.add_argument(
            "--start-time",
            help="ISO-8601 timestamp for the first snapshot; defaults to now (or now minus the flight "
            "duration when fast-forwarding, so timestamps stay in the past).",
        )

    def handle(self, *args, **options):
        scenario = self._load_scenario(options)
        if options["seed"] is not None:
            scenario.seed = options["seed"]
        if options["loops"] < 1:
            raise CommandError("--loops must be at least 1")
        if options["batch_size"] < 1:
            raise CommandError("--batch-size must be at least 1")
        if options["speed_factor"] <= 0:
            raise CommandError("--speed-factor must be greater than zero")

        transport = options["transport"]
        # Every transport speaks primary keys (the ingest API accepts nothing
        # else), so the scenario's rows are resolved — and optionally created —
        # up front regardless of where the snapshots are sent.
        ids = self._resolve_ids(scenario, bootstrap=options["bootstrap"])

        start_time = self._start_time(scenario, options)
        rng = random.Random(scenario.seed)
        snapshots = simulate(scenario, start_time=start_time, loops=options["loops"], rng=rng)

        interval = scenario.sample_interval_s / options["speed_factor"]
        batch: list[tuple] = []
        sent = 0
        readings = 0
        next_due = time.monotonic()
        for snapshot in snapshots:
            if options["realtime"]:
                delay = next_due - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                next_due += interval
            batch.append((snapshot, snapshot_to_payload(snapshot, ids.node, ids.radios, ids.stations)))
            readings += len(snapshot.readings)
            if len(batch) >= options["batch_size"]:
                sent += self._flush(batch, transport, options)
                batch = []
        if batch:
            sent += self._flush(batch, transport, options)

        self.stdout.write(
            self.style.SUCCESS(f"{scenario.name}: sent {sent} snapshot(s) with {readings} reading(s) via {transport}")
        )

    # --- scenario loading -------------------------------------------------

    def _load_scenario(self, options) -> Scenario:
        path = DEMO_SCENARIO if options["demo"] else pathlib.Path(options["scenario"])
        try:
            document = json.loads(path.read_text())
        except OSError as exc:
            raise CommandError(f"Cannot read scenario {path}: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise CommandError(f"Scenario {path} is not valid JSON: {exc}") from exc
        try:
            return Scenario.from_dict(document)
        except ScenarioError as exc:
            raise CommandError(f"Scenario {path} is invalid: {exc}") from exc

    def _start_time(self, scenario: Scenario, options) -> datetime.datetime:
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
        # Fast-forwarding would otherwise stamp most snapshots in the future,
        # which the ingest serializer rejects.
        return now - datetime.timedelta(seconds=scenario.sample_span_s(options["loops"]))

    # --- entity resolution ------------------------------------------------

    def _resolve_ids(self, scenario: Scenario, *, bootstrap: bool) -> "_Ids":
        if bootstrap:
            return self._bootstrap(scenario)
        try:
            node = Node.objects.get(name=scenario.node)
            radios = {
                radio.radio_type: Radio.objects.get(node=node, radio_type=radio.radio_type).pk
                for radio in scenario.radios
            }
            stations = {
                station.name: GroundStation.objects.get(name=station.name).pk for station in scenario.ground_stations
            }
        except (Node.DoesNotExist, Radio.DoesNotExist, GroundStation.DoesNotExist) as exc:
            raise CommandError(f"Scenario entity missing and --no-bootstrap was given: {exc}") from exc
        return _Ids(node=node.pk, radios=radios, stations=stations)

    @transaction.atomic
    def _bootstrap(self, scenario: Scenario) -> "_Ids":
        node, _ = Node.objects.get_or_create(name=scenario.node)
        radios = {}
        for radio_spec in scenario.radios:
            radio, created = Radio.objects.get_or_create(
                node=node, radio_type=radio_spec.radio_type, defaults={"bands": list(radio_spec.bands)}
            )
            missing = [band for band in radio_spec.bands if band not in radio.bands]
            if missing and not created:
                # An existing radio may predate the scenario; widen it rather than
                # emitting readings the ingest API would reject as UNKNOWN_BAND.
                radio.bands = list(radio.bands) + missing
                radio.save(update_fields=["bands"])
            radios[radio_spec.radio_type] = radio.pk
        stations = {}
        for station_spec in scenario.ground_stations:
            position = Point(
                station_spec.position.longitude,
                station_spec.position.latitude,
                station_spec.position.altitude,
                srid=4326,
            )
            station, _ = GroundStation.objects.get_or_create(name=station_spec.name, defaults={"position": position})
            stations[station_spec.name] = station.pk
        return _Ids(node=node.pk, radios=radios, stations=stations)

    # --- transports -------------------------------------------------------

    def _flush(self, batch: list[tuple], transport: str, options) -> int:
        if transport == "orm":
            return self._write_orm(batch)
        if transport == "http":
            return self._post_http([payload for _, payload in batch], options)
        for _, payload in batch:
            json.dump(payload, sys.stdout)
            sys.stdout.write("\n")
        sys.stdout.flush()
        return len(batch)

    @transaction.atomic
    def _write_orm(self, batch: list[tuple]) -> int:
        readings = []
        for snapshot, payload in batch:
            row = NodeSnapshot.objects.create(
                node_id=payload["node"],
                captured_at=snapshot.captured_at,
                position=Point(
                    snapshot.position.longitude,
                    snapshot.position.latitude,
                    snapshot.position.altitude,
                    srid=4326,
                ),
            )
            readings.extend(
                RadioReading(
                    snapshot=row,
                    radio_id=reading["radio"],
                    ground_station_id=reading["ground_station"],
                    band=reading["band"],
                    rssi_dbm=reading["rssi_dbm"],
                    snr_db=reading["snr_db"],
                )
                for reading in payload["radio_readings"]
            )
        RadioReading.objects.bulk_create(readings)
        return len(batch)

    def _post_http(self, payloads: list[dict], options) -> int:
        body = json.dumps(payloads).encode()
        request = urllib.request.Request(
            options["url"], data=body, method="POST", headers={"Content-Type": "application/json"}
        )
        if options["token"]:
            request.add_header("Authorization", f"Bearer {options['token']}")
        try:
            with urllib.request.urlopen(request) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise CommandError(f"Ingest returned HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise CommandError(f"Cannot reach ingest endpoint {options['url']}: {exc.reason}") from exc
        return len(payloads)


@dataclasses.dataclass
class _Ids:
    """Primary keys the ingest payloads refer to."""

    node: int
    radios: dict[str, int]
    stations: dict[str, int]
