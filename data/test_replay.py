"""Tests for the telemetry capture and replay tools [P12-05]."""

import datetime
import json

import pytest
from django.contrib.gis.geos import Point
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from .factories import (
    GroundStationFactory,
    MissionFactory,
    MissionPhaseFactory,
    NodeFactory,
    NodeSnapshotFactory,
    RadioFactory,
    RadioReadingFactory,
)
from .models import GroundStation, Node, NodeSnapshot, Radio, RadioReading
from .replay import SESSION_VERSION, Session, SessionError, snapshot_to_payload
from .serializers import NodeSnapshotWriteSerializer

RECORDED_AT = datetime.datetime(2026, 9, 1, 3, 0, tzinfo=datetime.timezone.utc)


def minimal_document(**overrides):
    document = {
        "version": SESSION_VERSION,
        "name": "test session",
        "recorded_at": RECORDED_AT.isoformat(),
        "nodes": [{"name": "uav-01", "radios": [{"radio_type": "wifi", "bands": ["2.4GHz", "5GHz"]}]}],
        "ground_stations": [
            {"name": "gs-north", "position": {"longitude": 172.60, "latitude": -43.60, "altitude": 12.0}}
        ],
        "snapshots": [
            {
                "node": "uav-01",
                "offset_s": 0.0,
                "position": {"longitude": 172.60, "latitude": -43.60, "altitude": 100.0},
                "readings": [
                    {
                        "radio_type": "wifi",
                        "band": "2.4GHz",
                        "ground_station": "gs-north",
                        "rssi_dbm": -68,
                        "snr_db": 27.0,
                    }
                ],
            },
            {
                "node": "uav-01",
                "offset_s": 2.5,
                "position": {"longitude": 172.61, "latitude": -43.60, "altitude": 110.0},
                "readings": [
                    {
                        "radio_type": "wifi",
                        "band": "5GHz",
                        "ground_station": "gs-north",
                        "rssi_dbm": -91,
                        "snr_db": None,
                    }
                ],
            },
        ],
    }
    document.update(overrides)
    return document


def minimal_session(**overrides):
    return Session.from_dict(minimal_document(**overrides))


def snapshots_with(readings, **snapshot_overrides):
    snapshot = {
        "node": "uav-01",
        "offset_s": 0.0,
        "position": {"longitude": 172.60, "latitude": -43.60, "altitude": 100.0},
        "readings": readings,
    }
    snapshot.update(snapshot_overrides)
    return [snapshot]


# --- the session format -----------------------------------------------------


def test_session_parses_nodes_stations_and_snapshots():
    session = minimal_session()
    assert session.name == "test session"
    assert session.recorded_at == RECORDED_AT
    assert [node.name for node in session.nodes] == ["uav-01"]
    assert session.node("uav-01").radios[0].bands == ("2.4GHz", "5GHz")
    assert [station.name for station in session.ground_stations] == ["gs-north"]
    assert len(session.snapshots) == 2
    assert session.reading_count == 2
    assert session.duration_s == pytest.approx(2.5)


def test_session_round_trips_through_its_own_document():
    session = minimal_session()
    assert Session.from_dict(session.as_dict()) == session


def test_snapshot_may_carry_an_absolute_timestamp_instead_of_an_offset():
    document = minimal_document(
        snapshots=snapshots_with([], captured_at=(RECORDED_AT + datetime.timedelta(seconds=7.5)).isoformat())
    )
    document["snapshots"][0].pop("offset_s")
    assert Session.from_dict(document).snapshots[0].offset_s == pytest.approx(7.5)


@pytest.mark.parametrize(
    "document,message",
    [
        ([], "must be a JSON object"),
        (minimal_document(version=SESSION_VERSION + 1), "newer than this tool understands"),
        (minimal_document(recorded_at="2026-09-01T03:00:00"), "must carry a UTC offset"),
        (minimal_document(recorded_at="not a time"), "not a valid ISO-8601"),
        (minimal_document(nodes=[]), "must list at least one node"),
        (
            minimal_document(nodes=[{"name": "uav-01", "radios": []}, {"name": "uav-01", "radios": []}]),
            "Duplicate entry 'uav-01' in nodes",
        ),
        (minimal_document(nodes=[{"radios": []}]), "needs a name"),
        (minimal_document(nodes=[{"name": "uav-01", "radios": [{"radio_type": "wifi"}]}]), "band identifiers"),
        (minimal_document(snapshots=[]), "at least one snapshot"),
        (minimal_document(snapshots=snapshots_with([], node="ghost")), "unknown node 'ghost'"),
        (minimal_document(snapshots=snapshots_with([], offset_s=-1)), "cannot be negative"),
        (minimal_document(snapshots=snapshots_with([], position={"longitude": 172.6})), "needs longitude"),
        (
            minimal_document(snapshots=snapshots_with([], position={"longitude": 200, "latitude": 0, "altitude": 0})),
            "longitude must be between",
        ),
        (
            minimal_document(
                snapshots=[
                    {"node": "uav-01", "offset_s": 5.0, "position": {"longitude": 1, "latitude": 1, "altitude": 1}},
                    {"node": "uav-01", "offset_s": 1.0, "position": {"longitude": 1, "latitude": 1, "altitude": 1}},
                ]
            ),
            "must be ordered by time",
        ),
        (
            minimal_document(
                snapshots=snapshots_with(
                    [{"radio_type": "lora", "band": "915MHz", "ground_station": "gs-north", "rssi_dbm": -80}]
                )
            ),
            "does not carry",
        ),
        (
            minimal_document(
                snapshots=snapshots_with(
                    [{"radio_type": "wifi", "band": "900MHz", "ground_station": "gs-north", "rssi_dbm": -80}]
                )
            ),
            "not configured on",
        ),
        (
            minimal_document(
                snapshots=snapshots_with(
                    [{"radio_type": "wifi", "band": "2.4GHz", "ground_station": "gs-ghost", "rssi_dbm": -80}]
                )
            ),
            "unknown ground station",
        ),
        (
            minimal_document(snapshots=snapshots_with([{"radio_type": "wifi", "band": "2.4GHz", "rssi_dbm": -80}])),
            "exactly one of ground_station or relay_node",
        ),
        (
            minimal_document(
                snapshots=snapshots_with(
                    [
                        {
                            "radio_type": "wifi",
                            "band": "2.4GHz",
                            "ground_station": "gs-north",
                            "relay_node": "uav-01",
                            "rssi_dbm": -80,
                        }
                    ]
                )
            ),
            "exactly one of ground_station or relay_node",
        ),
        (
            minimal_document(
                snapshots=snapshots_with(
                    [{"radio_type": "wifi", "band": "2.4GHz", "relay_node": "uav-ghost", "rssi_dbm": -80}]
                )
            ),
            "unknown relay node",
        ),
        (
            minimal_document(
                snapshots=snapshots_with(
                    [{"radio_type": "wifi", "band": "2.4GHz", "ground_station": "gs-north", "rssi_dbm": "-70"}]
                )
            ),
            "rssi_dbm must be an integer",
        ),
        (minimal_document(snapshots=snapshots_with([], offset_s=float("nan"))), "offset_s must be a finite number"),
    ],
)
def test_session_rejects_invalid_documents(document, message):
    with pytest.raises(SessionError, match=message):
        Session.from_dict(document)


def test_an_implausible_reading_survives_the_round_trip():
    """The value a fault produced is the thing being reproduced, so the format
    carries it; the ingest serializer is where the sensor range is enforced."""
    document = minimal_document(
        snapshots=snapshots_with(
            [{"radio_type": "wifi", "band": "2.4GHz", "ground_station": "gs-north", "rssi_dbm": -400}]
        )
    )
    assert Session.from_dict(document).snapshots[0].readings[0].rssi_dbm == -400


def test_a_radio_with_no_configured_bands_accepts_any_band():
    """``Radio.bands`` defaults to empty and the ingest serializer reads that as
    "any band", so a session captured from such a node has to load."""
    document = minimal_document(
        nodes=[{"name": "uav-01", "radios": [{"radio_type": "wifi", "bands": []}]}],
        snapshots=snapshots_with(
            [{"radio_type": "wifi", "band": "whatever", "ground_station": "gs-north", "rssi_dbm": -70}]
        ),
    )
    assert Session.from_dict(document).snapshots[0].readings[0].band == "whatever"


def test_timeline_rebases_while_preserving_the_recorded_gaps():
    session = minimal_session()
    start = datetime.datetime(2026, 9, 17, 8, 0, tzinfo=datetime.timezone.utc)
    stamps = [captured_at for _, captured_at in session.timeline(start)]
    assert stamps[0] == start
    assert (stamps[1] - stamps[0]).total_seconds() == pytest.approx(2.5)


def test_timeline_scale_compresses_the_gaps():
    session = minimal_session()
    start = datetime.datetime(2026, 9, 17, 8, 0, tzinfo=datetime.timezone.utc)
    stamps = [captured_at for _, captured_at in session.timeline(start, scale=0.2)]
    assert (stamps[1] - stamps[0]).total_seconds() == pytest.approx(0.5)


def test_original_timeline_returns_the_captured_times():
    stamps = [captured_at for _, captured_at in minimal_session().original_timeline()]
    assert stamps == [RECORDED_AT, RECORDED_AT + datetime.timedelta(seconds=2.5)]


def test_window_keeps_offsets_on_the_original_clock():
    session = minimal_session().window(1.0, None)
    assert [snapshot.offset_s for snapshot in session.snapshots] == [2.5]
    # The gap to the start of the recording is preserved, but a replay of the
    # window starts at its own first snapshot.
    assert session.duration_s == 0.0


def test_window_rejects_an_empty_selection():
    with pytest.raises(SessionError, match="No snapshots fall between"):
        minimal_session().window(60.0, 90.0)


def test_window_rejects_a_reversed_range():
    with pytest.raises(SessionError, match="must not be greater than"):
        minimal_session().window(10.0, 1.0)


def test_snapshot_to_payload_resolves_names_to_primary_keys():
    session = minimal_session()
    payload = snapshot_to_payload(
        session.snapshots[0],
        RECORDED_AT,
        node_ids={"uav-01": 4},
        radio_ids={("uav-01", "wifi"): 9},
        station_ids={"gs-north": 2},
    )
    assert payload["node"] == 4
    assert payload["captured_at"] == RECORDED_AT.isoformat()
    assert payload["position"] == {"longitude": 172.60, "latitude": -43.60, "altitude": 100.0}
    assert payload["radio_readings"] == [
        {
            "radio": 9,
            "ground_station": 2,
            "relay_node": None,
            "band": "2.4GHz",
            "rssi_dbm": -68,
            "snr_db": 27.0,
        }
    ]


def test_snapshot_to_payload_resolves_a_relay_receiver():
    document = minimal_document(
        snapshots=snapshots_with([{"radio_type": "wifi", "band": "2.4GHz", "relay_node": "uav-01", "rssi_dbm": -75}])
    )
    payload = snapshot_to_payload(
        Session.from_dict(document).snapshots[0],
        RECORDED_AT,
        node_ids={"uav-01": 4},
        radio_ids={("uav-01", "wifi"): 9},
        station_ids={},
    )
    reading = payload["radio_readings"][0]
    assert (reading["ground_station"], reading["relay_node"]) == (None, 4)


# --- fixtures for the commands ----------------------------------------------


@pytest.fixture
def session_file(tmp_path):
    path = tmp_path / "session.json"
    path.write_text(json.dumps(minimal_document()))
    return str(path)


@pytest.fixture
def recorded_flight():
    """Two nodes reporting on a fixed clock, with a relay and a ground station."""
    start = timezone.now() - datetime.timedelta(minutes=10)
    start = start.replace(microsecond=0)
    uav = NodeFactory(name="uav-01")
    relay = NodeFactory(name="uav-relay")
    wifi = RadioFactory(node=uav, radio_type=Radio.RadioType.WIFI, bands=["2.4GHz", "5GHz"])
    lora = RadioFactory(node=uav, radio_type=Radio.RadioType.LORA, bands=["915MHz"])
    station = GroundStationFactory(name="gs-north", position=Point(172.60, -43.60, 12.0, srid=4326))
    snapshots = []
    for index in range(3):
        snapshot = NodeSnapshotFactory(
            node=uav,
            captured_at=start + datetime.timedelta(seconds=index * 5),
            position=Point(172.60 + index * 0.001, -43.60, 100.0 + index, srid=4326),
        )
        RadioReadingFactory(
            snapshot=snapshot, radio=wifi, ground_station=station, band="2.4GHz", rssi_dbm=-70 - index, snr_db=25.0
        )
        RadioReadingFactory(
            snapshot=snapshot,
            radio=lora,
            ground_station=None,
            relay_node=relay,
            band="915MHz",
            rssi_dbm=-95,
            snr_db=None,
        )
        snapshots.append(snapshot)
    return {"start": start, "uav": uav, "relay": relay, "station": station, "snapshots": snapshots}


def capture(tmp_path, name="captured.json", **options):
    path = tmp_path / name
    call_command("capture_telemetry", output=str(path), **options)
    return path


# --- capture ----------------------------------------------------------------


@pytest.mark.django_db
def test_capture_writes_a_replayable_session(tmp_path, recorded_flight):
    document = json.loads(capture(tmp_path).read_text())
    session = Session.from_dict(document)

    assert document["version"] == SESSION_VERSION
    assert session.recorded_at == recorded_flight["start"]
    assert [snapshot.offset_s for snapshot in session.snapshots] == [0.0, 5.0, 10.0]
    # The relay is carried even though it never reported a snapshot of its own.
    assert sorted(node.name for node in session.nodes) == ["uav-01", "uav-relay"]
    assert [station.name for station in session.ground_stations] == ["gs-north"]
    # Every radio of an involved node is described, not just the ones heard.
    assert sorted(radio.radio_type for radio in session.node("uav-01").radios) == ["lora", "wifi"]
    first = session.snapshots[0]
    assert first.position.altitude == 100.0
    assert {reading.rssi_dbm for reading in first.readings} == {-70, -95}
    assert [reading.relay_node for reading in first.readings if reading.relay_node] == ["uav-relay"]


@pytest.mark.django_db
def test_capture_records_its_own_provenance(tmp_path, recorded_flight):
    document = json.loads(capture(tmp_path, nodes=["uav-01"], limit=2).read_text())
    assert document["source"]["command"] == "capture_telemetry"
    assert document["source"]["filters"]["nodes"] == ["uav-01"]
    assert document["source"]["filters"]["limit"] == 2


@pytest.mark.django_db
def test_capture_is_reproducible(tmp_path, recorded_flight):
    first = capture(tmp_path, name="a.json").read_text()
    second = capture(tmp_path, name="b.json").read_text()
    # Only the export timestamp may differ between two captures of one window.
    assert json.loads(first)["snapshots"] == json.loads(second)["snapshots"]
    assert json.loads(first)["nodes"] == json.loads(second)["nodes"]


@pytest.mark.django_db
def test_capture_filters_by_node(tmp_path, recorded_flight):
    NodeSnapshotFactory(node=recorded_flight["relay"], captured_at=recorded_flight["start"])
    session = Session.from_dict(json.loads(capture(tmp_path, nodes=["uav-relay"]).read_text()))
    assert {snapshot.node for snapshot in session.snapshots} == {"uav-relay"}


@pytest.mark.django_db
def test_capture_filters_by_time_window(tmp_path, recorded_flight):
    since = recorded_flight["start"] + datetime.timedelta(seconds=5)
    session = Session.from_dict(json.loads(capture(tmp_path, since=since.isoformat()).read_text()))
    assert len(session.snapshots) == 2
    assert session.recorded_at == since


@pytest.mark.django_db
def test_capture_limit_keeps_the_earliest_snapshots(tmp_path, recorded_flight):
    session = Session.from_dict(json.loads(capture(tmp_path, limit=1).read_text()))
    assert len(session.snapshots) == 1
    assert session.recorded_at == recorded_flight["start"]


@pytest.mark.django_db
def test_capture_takes_its_window_from_a_mission(tmp_path, recorded_flight):
    mission = MissionFactory()
    MissionPhaseFactory(
        mission=mission,
        started_at=recorded_flight["start"] + datetime.timedelta(seconds=5),
        ended_at=recorded_flight["start"] + datetime.timedelta(seconds=5),
    )
    session = Session.from_dict(json.loads(capture(tmp_path, mission=mission.pk).read_text()))
    assert len(session.snapshots) == 1
    assert session.snapshots[0].offset_s == 0.0


@pytest.mark.django_db
def test_capture_of_a_running_mission_has_an_open_window(tmp_path, recorded_flight):
    mission = MissionFactory()
    MissionPhaseFactory(mission=mission, started_at=recorded_flight["start"], ended_at=None)
    session = Session.from_dict(json.loads(capture(tmp_path, mission=mission.pk).read_text()))
    assert len(session.snapshots) == 3


@pytest.mark.django_db
def test_capture_rejects_a_mission_that_never_started(tmp_path, recorded_flight):
    mission = MissionFactory()
    MissionPhaseFactory(mission=mission)
    with pytest.raises(CommandError, match="no phases that were ever activated"):
        capture(tmp_path, mission=mission.pk)


@pytest.mark.django_db
def test_capture_rejects_an_unknown_mission(tmp_path, recorded_flight):
    with pytest.raises(CommandError, match="does not exist"):
        capture(tmp_path, mission=9999)


@pytest.mark.django_db
def test_capture_rejects_an_unknown_node(tmp_path, recorded_flight):
    with pytest.raises(CommandError, match="Unknown node"):
        capture(tmp_path, nodes=["uav-ghost"])


@pytest.mark.django_db
def test_capture_rejects_an_empty_window(tmp_path, recorded_flight):
    with pytest.raises(CommandError, match="No snapshots matched"):
        capture(tmp_path, since=timezone.now().isoformat())


@pytest.mark.django_db
def test_capture_rejects_an_unparsable_timestamp(tmp_path, recorded_flight):
    with pytest.raises(CommandError, match="not a valid ISO-8601"):
        capture(tmp_path, since="yesterday")


@pytest.mark.django_db
def test_capture_writes_only_the_document_to_stdout(recorded_flight, capsys):
    """`capture_telemetry > session.json` has to leave a file that parses, so
    the summary goes to stderr whenever the document is on stdout."""
    call_command("capture_telemetry")
    captured = capsys.readouterr()
    assert len(json.loads(captured.out)["snapshots"]) == 3
    assert "Captured 3 snapshot(s)" in captured.err


# --- replay -----------------------------------------------------------------


@pytest.mark.django_db
def test_replay_bootstraps_entities_and_writes_snapshots(session_file):
    call_command("replay_telemetry", session_file)

    node = Node.objects.get(name="uav-01")
    assert set(Radio.objects.get(node=node, radio_type="wifi").bands) == {"2.4GHz", "5GHz"}
    assert GroundStation.objects.filter(name="gs-north").exists()
    snapshots = list(NodeSnapshot.objects.filter(node=node).order_by("captured_at"))
    assert len(snapshots) == 2
    assert [snapshot.position.z for snapshot in snapshots] == [100.0, 110.0]
    assert sorted(RadioReading.objects.values_list("rssi_dbm", flat=True)) == [-91, -68]
    # Fast-forwarded replays are backdated so the ingest rules would accept them.
    assert snapshots[-1].captured_at <= timezone.now()


@pytest.mark.django_db
def test_replay_preserves_the_recorded_gaps(session_file):
    call_command("replay_telemetry", session_file)
    stamps = list(NodeSnapshot.objects.order_by("captured_at").values_list("captured_at", flat=True))
    assert (stamps[1] - stamps[0]).total_seconds() == pytest.approx(2.5)


@pytest.mark.django_db
def test_replaying_twice_produces_identical_telemetry(session_file):
    call_command("replay_telemetry", session_file, start_time="2026-09-17T01:00:00+00:00")
    first = list(
        RadioReading.objects.order_by("snapshot__captured_at", "band").values_list(
            "snapshot__captured_at", "band", "rssi_dbm", "snr_db"
        )
    )
    RadioReading.objects.all().delete()
    NodeSnapshot.objects.all().delete()
    call_command("replay_telemetry", session_file, start_time="2026-09-17T01:00:00+00:00")
    second = list(
        RadioReading.objects.order_by("snapshot__captured_at", "band").values_list(
            "snapshot__captured_at", "band", "rssi_dbm", "snr_db"
        )
    )
    assert first == second


@pytest.mark.django_db
def test_capture_then_replay_reproduces_the_original_telemetry(tmp_path, recorded_flight):
    path = capture(tmp_path)
    original = list(
        RadioReading.objects.order_by("snapshot__captured_at", "band").values_list(
            "snapshot__captured_at", "radio__radio_type", "band", "rssi_dbm", "snr_db"
        )
    )
    RadioReading.objects.all().delete()
    NodeSnapshot.objects.all().delete()
    Radio.objects.all().delete()
    GroundStation.objects.all().delete()
    Node.objects.all().delete()

    call_command("replay_telemetry", str(path), preserve_timestamps=True)

    replayed = list(
        RadioReading.objects.order_by("snapshot__captured_at", "band").values_list(
            "snapshot__captured_at", "radio__radio_type", "band", "rssi_dbm", "snr_db"
        )
    )
    assert replayed == original
    # The rows were rebuilt from names, not from the primary keys they had.
    assert RadioReading.objects.filter(relay_node__name="uav-relay").count() == 3
    assert RadioReading.objects.filter(ground_station__name="gs-north").count() == 3


@pytest.mark.django_db
def test_replay_start_time_pins_the_first_snapshot(session_file):
    call_command("replay_telemetry", session_file, start_time="2026-09-17T01:00:00+00:00")
    first = NodeSnapshot.objects.order_by("captured_at").first()
    assert first.captured_at == datetime.datetime(2026, 9, 17, 1, 0, tzinfo=datetime.timezone.utc)


@pytest.mark.django_db
def test_replay_preserve_timestamps_keeps_the_original_clock(session_file):
    call_command("replay_telemetry", session_file, preserve_timestamps=True)
    assert NodeSnapshot.objects.order_by("captured_at").first().captured_at == RECORDED_AT


@pytest.mark.django_db
def test_replay_rejects_preserve_timestamps_with_start_time(session_file):
    with pytest.raises(CommandError, match="use one or the other"):
        call_command("replay_telemetry", session_file, preserve_timestamps=True, start_time="2026-09-17T01:00:00Z")


@pytest.mark.django_db
def test_replay_window_selects_part_of_the_session(session_file):
    call_command("replay_telemetry", session_file, from_offset=1.0)
    assert NodeSnapshot.objects.count() == 1
    assert RadioReading.objects.get().band == "5GHz"


@pytest.mark.django_db
def test_replay_rejects_a_window_with_no_snapshots(session_file):
    with pytest.raises(CommandError, match="No snapshots fall between"):
        call_command("replay_telemetry", session_file, from_offset=60.0)


@pytest.mark.django_db
def test_replay_without_bootstrap_requires_existing_entities(session_file):
    with pytest.raises(CommandError, match="Session entity missing"):
        call_command("replay_telemetry", session_file, bootstrap=False)


@pytest.mark.django_db
def test_replay_widens_the_bands_of_an_existing_radio(session_file):
    node = NodeFactory(name="uav-01")
    RadioFactory(node=node, radio_type=Radio.RadioType.WIFI, bands=["2.4GHz"])
    call_command("replay_telemetry", session_file)
    assert set(Radio.objects.get(node=node, radio_type="wifi").bands) == {"2.4GHz", "5GHz"}


@pytest.mark.django_db
def test_replay_dry_run_changes_nothing(session_file, capsys):
    call_command("replay_telemetry", session_file, dry_run=True)
    output = capsys.readouterr().out
    assert "test session" in output
    assert "would be created" in output
    assert NodeSnapshot.objects.count() == 0
    assert Node.objects.count() == 0


@pytest.mark.django_db
def test_replay_stdout_transport_emits_ingest_payloads(session_file, capsys):
    call_command("replay_telemetry", session_file, transport="stdout")
    lines = [line for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    payload = json.loads(lines[0])
    assert payload["node"] == Node.objects.get(name="uav-01").pk
    assert payload["radio_readings"][0]["band"] == "2.4GHz"
    assert NodeSnapshot.objects.count() == 0


@pytest.mark.django_db
def test_replayed_payloads_pass_the_ingest_serializer(session_file, capsys):
    call_command("replay_telemetry", session_file, transport="stdout")
    payloads = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    serializer = NodeSnapshotWriteSerializer(data=payloads, many=True)
    assert serializer.is_valid(), serializer.errors


@pytest.mark.django_db
def test_replay_http_transport_posts_batches(session_file, monkeypatch):
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

    monkeypatch.setattr("data.telemetry_transport.urllib.request.urlopen", fake_urlopen)
    call_command("replay_telemetry", session_file, transport="http", batch_size=2, url="http://app/ingest/")

    assert [url for url, _ in posted] == ["http://app/ingest/"]
    assert len(posted[0][1]) == 2
    assert NodeSnapshot.objects.count() == 0


@pytest.mark.django_db
def test_replay_http_transport_reports_ingest_errors(session_file, monkeypatch):
    import urllib.error

    def fake_urlopen(request, *args, **kwargs):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr("data.telemetry_transport.urllib.request.urlopen", fake_urlopen)
    with pytest.raises(CommandError, match="Cannot reach ingest endpoint"):
        call_command("replay_telemetry", session_file, transport="http")


@pytest.mark.django_db
def test_replay_rejects_a_malformed_session(tmp_path):
    path = tmp_path / "broken.json"
    path.write_text('{"nodes": []}')
    with pytest.raises(CommandError, match="is invalid"):
        call_command("replay_telemetry", str(path))


@pytest.mark.django_db
def test_replay_rejects_a_file_that_is_not_json(tmp_path):
    path = tmp_path / "broken.json"
    path.write_text("not json")
    with pytest.raises(CommandError, match="is not valid JSON"):
        call_command("replay_telemetry", str(path))


@pytest.mark.django_db
def test_replay_rejects_a_missing_file(tmp_path):
    with pytest.raises(CommandError, match="Cannot read session"):
        call_command("replay_telemetry", str(tmp_path / "absent.json"))


@pytest.mark.django_db
def test_replay_rejects_a_zero_speed_factor(session_file):
    with pytest.raises(CommandError, match="--speed-factor"):
        call_command("replay_telemetry", session_file, speed_factor=0)


@pytest.mark.django_db
def test_replay_rejects_a_zero_batch_size(session_file):
    with pytest.raises(CommandError, match="--batch-size"):
        call_command("replay_telemetry", session_file, batch_size=0)


@pytest.mark.django_db
def test_realtime_replay_paces_off_the_recorded_offsets(session_file, monkeypatch):
    slept = []
    monkeypatch.setattr("data.management.commands.replay_telemetry.time.sleep", slept.append)
    call_command("replay_telemetry", session_file, realtime=True, speed_factor=5.0)
    # The 2.5 s gap replays in a fifth of the time; the first snapshot is due
    # immediately, so only the second waits.
    assert len(slept) == 1
    assert slept[0] == pytest.approx(0.5, abs=0.05)


@pytest.mark.django_db
def test_replay_rejects_a_non_finite_speed_factor(session_file):
    with pytest.raises(CommandError, match="must be a finite number"):
        call_command("replay_telemetry", session_file, speed_factor=float("nan"))


@pytest.mark.django_db
def test_capture_refuses_a_reading_on_another_nodes_radio(tmp_path, recorded_flight):
    stray = RadioFactory(node=recorded_flight["relay"], radio_type=Radio.RadioType.CELLULAR, bands=["LTE"])
    RadioReadingFactory(
        snapshot=recorded_flight["snapshots"][0],
        radio=stray,
        ground_station=recorded_flight["station"],
        band="LTE",
        rssi_dbm=-80,
    )
    with pytest.raises(CommandError, match="cannot be captured"):
        capture(tmp_path)


@pytest.mark.django_db
def test_capture_refuses_duplicate_node_names(tmp_path, recorded_flight):
    NodeFactory(name="uav-01")
    with pytest.raises(CommandError, match="More than one node is named"):
        capture(tmp_path)


@pytest.mark.django_db
def test_capture_refuses_to_write_a_session_it_could_not_replay(tmp_path, recorded_flight):
    """A reading written straight through the ORM can carry a band the radio
    never declared; the operator should learn that here, not when the replay
    refuses the file."""
    RadioReadingFactory(
        snapshot=recorded_flight["snapshots"][0],
        radio=Radio.objects.get(node=recorded_flight["uav"], radio_type=Radio.RadioType.WIFI),
        ground_station=recorded_flight["station"],
        band="60GHz",
        rssi_dbm=-70,
    )
    with pytest.raises(CommandError, match="cannot be represented as a replayable session"):
        capture(tmp_path)
    assert not (tmp_path / "captured.json").exists()


@pytest.mark.django_db
def test_replay_refuses_duplicate_node_names(session_file):
    NodeFactory(name="uav-01")
    NodeFactory(name="uav-01")
    with pytest.raises(CommandError, match="More than one node in this database"):
        call_command("replay_telemetry", session_file)


@pytest.mark.django_db
def test_realtime_replay_compresses_capture_times_with_the_speed_factor(session_file, monkeypatch):
    """Capture times have to keep pace with the wall clock: stamping the full
    recorded gaps onto a faster replay would run the session into the future,
    which the ingest API rejects."""
    monkeypatch.setattr("data.management.commands.replay_telemetry.time.sleep", lambda _: None)
    call_command("replay_telemetry", session_file, realtime=True, speed_factor=5.0)
    stamps = list(NodeSnapshot.objects.order_by("captured_at").values_list("captured_at", flat=True))
    assert (stamps[1] - stamps[0]).total_seconds() == pytest.approx(0.5)
    # Sleeping is stubbed out here, so the clock does not advance with the
    # replay; what matters is that the session no longer outruns it.
    assert stamps[-1] - timezone.now() < datetime.timedelta(seconds=1)
