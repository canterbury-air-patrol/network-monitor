"""Tests for the flight path simulator [P3-15]."""

import datetime
import json
import random

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from .factories import GroundStationFactory, NodeFactory, RadioFactory
from .management.commands.simulate_flight import DEMO_SCENARIO
from .models import GroundStation, Node, NodeSnapshot, Radio, RadioReading
from .serializers import NodeSnapshotWriteSerializer
from .simulation import (
    Position,
    Scenario,
    ScenarioError,
    distance_3d,
    interpolate,
    sample_path,
    simulate,
    snapshot_to_payload,
)

START = datetime.datetime(2026, 8, 29, 12, 0, tzinfo=datetime.timezone.utc)


def minimal_document(**overrides):
    document = {
        "name": "test flight",
        "seed": 7,
        "sample_interval_s": 5.0,
        "uav": {
            "node": "sim-uav",
            "ground_speed_mps": 20.0,
            "radios": [{"radio_type": "wifi", "bands": ["2.4GHz", "5GHz"]}],
        },
        "ground_stations": [{"name": "sim-gs", "longitude": 172.60, "latitude": -43.60, "altitude": 10.0}],
        "waypoints": [
            {"longitude": 172.60, "latitude": -43.60, "altitude": 100.0},
            {"longitude": 172.61, "latitude": -43.60, "altitude": 100.0},
        ],
    }
    document.update(overrides)
    return document


def minimal_scenario(**overrides):
    return Scenario.from_dict(minimal_document(**overrides))


# --- geometry ---------------------------------------------------------------


def test_distance_3d_matches_known_latitude_span():
    # One degree of latitude is ~111.2 km.
    metres = distance_3d(Position(172.6, -43.0, 0.0), Position(172.6, -44.0, 0.0))
    assert metres == pytest.approx(111_195, rel=0.001)


def test_distance_3d_includes_altitude():
    slant = distance_3d(Position(172.6, -43.6, 0.0), Position(172.6, -43.6, 300.0))
    assert slant == pytest.approx(300.0)


def test_interpolate_midpoint():
    mid = interpolate(Position(172.0, -43.0, 0.0), Position(172.2, -43.4, 100.0), 0.5)
    assert (mid.longitude, mid.latitude, mid.altitude) == pytest.approx((172.1, -43.2, 50.0))


def test_sample_path_spacing_and_endpoint():
    waypoints = (Position(172.60, -43.60, 100.0), Position(172.65, -43.60, 100.0))
    positions = sample_path(waypoints, ground_speed_mps=20.0, interval_s=5.0)
    assert positions[0] == waypoints[0]
    assert positions[-1] == waypoints[-1]
    # Every step except the final partial one covers speed * interval metres.
    steps = [distance_3d(a, b) for a, b in zip(positions[:-2], positions[1:-1], strict=False)]
    assert all(step == pytest.approx(100.0, rel=1e-6) for step in steps)


def test_sample_path_rejects_zero_length_path():
    point = Position(172.6, -43.6, 100.0)
    with pytest.raises(ScenarioError):
        sample_path((point, point), ground_speed_mps=10.0, interval_s=1.0)


# --- scenario parsing -------------------------------------------------------


def test_demo_scenario_parses():
    scenario = Scenario.from_dict(json.loads(DEMO_SCENARIO.read_text()))
    assert scenario.node == "sim-uav-01"
    assert len(scenario.ground_stations) == 3
    assert scenario.duration_s > 0


@pytest.mark.parametrize(
    "document, message",
    [
        (minimal_document(waypoints=[{"longitude": 172.6, "latitude": -43.6, "altitude": 10.0}]), "at least two"),
        (minimal_document(ground_stations=[]), "at least one station"),
        (
            minimal_document(
                ground_stations=[
                    {"name": "dupe", "longitude": 172.6, "latitude": -43.6, "altitude": 1.0},
                    {"name": "dupe", "longitude": 172.7, "latitude": -43.6, "altitude": 1.0},
                ]
            ),
            "Duplicate entry",
        ),
        (minimal_document(links=[{"ground_station": "nope", "rssi_dbm": -70}]), "unknown ground station"),
        (minimal_document(links=[{"band": "60GHz", "rssi_dbm": -70}]), "unknown band"),
        (minimal_document(links=[{"band": "5GHz", "tx_power": 20}]), "Unknown link parameter"),
        (minimal_document(links=[{"band": "5GHz"}]), "at least one link parameter"),
        (minimal_document(dropouts=[{"ground_station": "sim-gs", "from_s": 10, "to_s": 5}]), "greater than from_s"),
        (minimal_document(dropouts=[{"ground_station": "other", "from_s": 1, "to_s": 5}]), "unknown ground station"),
        (minimal_document(sample_interval_s=0), "greater than zero"),
        ({"uav": {}}, "Missing required key"),
    ],
)
def test_scenario_rejects_invalid_documents(document, message):
    with pytest.raises(ScenarioError, match=message):
        Scenario.from_dict(document)


def test_link_overrides_apply_in_file_order():
    scenario = minimal_scenario(
        links=[
            {"band": "5GHz", "path_loss_exponent": 3.0},
            {"band": "5GHz", "ground_station": "sim-gs", "rssi_dbm": -81},
        ]
    )
    broad = scenario.link_profile("wifi", "5GHz", "sim-gs")
    assert broad.path_loss_exponent == 3.0
    assert broad.rssi_dbm == -81
    untouched = scenario.link_profile("wifi", "2.4GHz", "sim-gs")
    assert untouched.path_loss_exponent == pytest.approx(2.2)
    assert untouched.rssi_dbm is None


# --- signal generation ------------------------------------------------------


def test_readings_cover_every_radio_band_and_station():
    scenario = minimal_scenario()
    snapshot = next(simulate(scenario, START))
    assert {(r.band, r.ground_station) for r in snapshot.readings} == {
        ("2.4GHz", "sim-gs"),
        ("5GHz", "sim-gs"),
    }


def test_same_seed_reproduces_identical_readings():
    scenario = minimal_scenario()
    first = [s.readings for s in simulate(scenario, START, rng=random.Random(scenario.seed))]
    second = [s.readings for s in simulate(scenario, START, rng=random.Random(scenario.seed))]
    assert first == second
    other = [s.readings for s in simulate(scenario, START, rng=random.Random(scenario.seed + 1))]
    assert other != first


def test_fixed_rssi_is_used_verbatim_and_snr_follows_noise_floor():
    scenario = minimal_scenario(
        links=[{"rssi_dbm": -72, "noise_sigma_db": 0, "noise_floor_dbm": -95.0}],
    )
    snapshot = next(simulate(scenario, START))
    assert {r.rssi_dbm for r in snapshot.readings} == {-72}
    assert {r.snr_db for r in snapshot.readings} == {23.0}


def test_null_noise_floor_leaves_snr_unset():
    scenario = minimal_scenario(links=[{"rssi_dbm": -72, "noise_floor_dbm": None}])
    assert all(r.snr_db is None for r in next(simulate(scenario, START)).readings)


def test_disabled_link_emits_no_readings():
    scenario = minimal_scenario(links=[{"band": "5GHz", "enabled": False}])
    bands = {r.band for snapshot in simulate(scenario, START) for r in snapshot.readings}
    assert bands == {"2.4GHz"}


def test_max_range_creates_a_coverage_gap():
    scenario = minimal_scenario(links=[{"max_range_m": 300.0, "rssi_dbm": -70}])
    snapshots = list(simulate(scenario, START))
    assert snapshots[0].readings  # starts on top of the station
    assert not snapshots[-1].readings  # ~800 m away at the far waypoint


def test_signal_weakens_with_distance():
    scenario = minimal_scenario(links=[{"noise_sigma_db": 0}])
    snapshots = list(simulate(scenario, START))
    near = [r.rssi_dbm for r in snapshots[0].readings if r.band == "2.4GHz"][0]
    far = [r.rssi_dbm for r in snapshots[-1].readings if r.band == "2.4GHz"][0]
    assert far < near


def test_dropout_window_suppresses_a_station():
    scenario = minimal_scenario(
        ground_stations=[
            {"name": "sim-gs", "longitude": 172.60, "latitude": -43.60, "altitude": 10.0},
            {"name": "sim-gs-2", "longitude": 172.61, "latitude": -43.60, "altitude": 10.0},
        ],
        dropouts=[{"ground_station": "sim-gs-2", "from_s": 5.0, "to_s": 15.0}],
    )
    by_elapsed = {s.elapsed_s: {r.ground_station for r in s.readings} for s in simulate(scenario, START)}
    assert "sim-gs-2" in by_elapsed[0.0]
    assert "sim-gs-2" not in by_elapsed[5.0]
    assert "sim-gs-2" not in by_elapsed[10.0]
    assert "sim-gs-2" in by_elapsed[15.0]


def test_timestamps_advance_by_the_sample_interval():
    scenario = minimal_scenario()
    snapshots = list(simulate(scenario, START))
    assert snapshots[0].captured_at == START
    assert snapshots[1].captured_at == START + datetime.timedelta(seconds=5)


def test_loops_repeat_the_path_without_duplicating_the_join():
    scenario = minimal_scenario()
    single = list(simulate(scenario, START))
    doubled = list(simulate(scenario, START, loops=2))
    assert len(doubled) == 2 * len(single) - 1
    assert doubled[len(single) - 1].position == single[-1].position


def test_simulate_rejects_zero_loops():
    with pytest.raises(ValueError):
        next(simulate(minimal_scenario(), START, loops=0))


# --- payload conversion -----------------------------------------------------


@pytest.mark.django_db
def test_generated_payloads_pass_the_ingest_serializer():
    node = NodeFactory(name="sim-uav")
    radio = RadioFactory(node=node, radio_type=Radio.RadioType.WIFI, bands=["2.4GHz", "5GHz"])
    station = GroundStationFactory(name="sim-gs")
    scenario = minimal_scenario()
    payloads = [
        snapshot_to_payload(snapshot, node.pk, {"wifi": radio.pk}, {"sim-gs": station.pk})
        for snapshot in simulate(scenario, timezone.now() - datetime.timedelta(minutes=5))
    ]
    serializer = NodeSnapshotWriteSerializer(data=payloads, many=True)
    assert serializer.is_valid(), serializer.errors


# --- management command -----------------------------------------------------


@pytest.fixture
def scenario_file(tmp_path):
    path = tmp_path / "scenario.json"
    path.write_text(json.dumps(minimal_document()))
    return str(path)


@pytest.mark.django_db
def test_command_bootstraps_entities_and_writes_snapshots(scenario_file):
    call_command("simulate_flight", scenario=scenario_file)
    node = Node.objects.get(name="sim-uav")
    assert set(Radio.objects.get(node=node, radio_type="wifi").bands) == {"2.4GHz", "5GHz"}
    assert GroundStation.objects.filter(name="sim-gs").exists()
    snapshots = NodeSnapshot.objects.filter(node=node)
    assert snapshots.count() > 1
    assert RadioReading.objects.filter(snapshot__node=node).exists()
    # Fast-forwarded flights are backdated so the ingest rules would accept them.
    assert snapshots.order_by("-captured_at").first().captured_at <= timezone.now()


@pytest.mark.django_db
def test_command_widens_the_bands_of_an_existing_radio(scenario_file):
    node = NodeFactory(name="sim-uav")
    RadioFactory(node=node, radio_type=Radio.RadioType.WIFI, bands=["2.4GHz"])
    call_command("simulate_flight", scenario=scenario_file)
    assert set(Radio.objects.get(node=node, radio_type="wifi").bands) == {"2.4GHz", "5GHz"}


@pytest.mark.django_db
def test_command_without_bootstrap_requires_existing_entities(scenario_file):
    with pytest.raises(CommandError, match="Scenario entity missing"):
        call_command("simulate_flight", scenario=scenario_file, bootstrap=False)


@pytest.mark.django_db
def test_command_loops_multiply_the_snapshot_count(scenario_file):
    call_command("simulate_flight", scenario=scenario_file)
    single = NodeSnapshot.objects.count()
    NodeSnapshot.objects.all().delete()
    call_command("simulate_flight", scenario=scenario_file, loops=2)
    assert NodeSnapshot.objects.count() == 2 * single - 1


@pytest.mark.django_db
def test_command_seed_option_overrides_the_scenario_seed(scenario_file):
    call_command("simulate_flight", scenario=scenario_file, seed=1)
    first = list(RadioReading.objects.order_by("id").values_list("rssi_dbm", flat=True))
    RadioReading.objects.all().delete()
    NodeSnapshot.objects.all().delete()
    call_command("simulate_flight", scenario=scenario_file, seed=2)
    second = list(RadioReading.objects.order_by("id").values_list("rssi_dbm", flat=True))
    assert first != second


@pytest.mark.django_db
def test_command_stdout_transport_emits_ingest_payloads(scenario_file, capsys):
    call_command("simulate_flight", scenario=scenario_file, transport="stdout")
    lines = [line for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    payload = json.loads(lines[0])
    assert payload["node"] == Node.objects.get(name="sim-uav").pk
    assert payload["position"].keys() == {"longitude", "latitude", "altitude"}
    assert payload["radio_readings"][0]["band"] in {"2.4GHz", "5GHz"}
    assert NodeSnapshot.objects.count() == 0


@pytest.mark.django_db
def test_command_http_transport_posts_batches(scenario_file, monkeypatch):
    posted = []

    class FakeResponse:
        def read(self):
            return b'{"created": 1}'

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, *args, **kwargs):
        posted.append((request.full_url, json.loads(request.data)))
        return FakeResponse()

    monkeypatch.setattr("data.management.commands.simulate_flight.urllib.request.urlopen", fake_urlopen)
    call_command("simulate_flight", scenario=scenario_file, transport="http", batch_size=5, url="http://app/ingest/")

    assert posted
    assert all(url == "http://app/ingest/" for url, _ in posted)
    assert all(len(body) <= 5 for _, body in posted)
    assert NodeSnapshot.objects.count() == 0


@pytest.mark.django_db
def test_command_http_transport_reports_ingest_errors(scenario_file, monkeypatch):
    import urllib.error

    def fake_urlopen(request, *args, **kwargs):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr("data.management.commands.simulate_flight.urllib.request.urlopen", fake_urlopen)
    with pytest.raises(CommandError, match="Cannot reach ingest endpoint"):
        call_command("simulate_flight", scenario=scenario_file, transport="http")


@pytest.mark.django_db
def test_command_rejects_a_malformed_scenario(tmp_path):
    path = tmp_path / "broken.json"
    path.write_text('{"uav": {}}')
    with pytest.raises(CommandError, match="is invalid"):
        call_command("simulate_flight", scenario=str(path))


@pytest.mark.django_db
def test_command_rejects_a_missing_scenario_file(tmp_path):
    with pytest.raises(CommandError, match="Cannot read scenario"):
        call_command("simulate_flight", scenario=str(tmp_path / "absent.json"))


@pytest.mark.django_db
def test_command_start_time_option_sets_the_first_timestamp(scenario_file):
    call_command("simulate_flight", scenario=scenario_file, start_time="2026-08-29T01:00:00+00:00")
    first = NodeSnapshot.objects.order_by("captured_at").first()
    assert first.captured_at == datetime.datetime(2026, 8, 29, 1, 0, tzinfo=datetime.timezone.utc)


@pytest.mark.django_db
def test_command_rejects_an_unparsable_start_time(scenario_file):
    with pytest.raises(CommandError, match="not a valid ISO-8601"):
        call_command("simulate_flight", scenario=scenario_file, start_time="yesterday")


@pytest.mark.django_db
def test_demo_scenario_runs_end_to_end():
    call_command("simulate_flight", demo=True)
    assert NodeSnapshot.objects.filter(node__name="sim-uav-01").exists()
    assert RadioReading.objects.filter(ground_station__name="sim-gs-command").exists()
    # The valley station has no 5 GHz antenna, and the ridge station drops out.
    assert not RadioReading.objects.filter(ground_station__name="sim-gs-valley", band="5GHz").exists()


def test_sample_span_covers_every_emitted_sample():
    scenario = minimal_scenario()
    for loops in (1, 3):
        snapshots = list(simulate(scenario, START, loops=loops))
        assert scenario.sample_span_s(loops) == pytest.approx(snapshots[-1].elapsed_s)
