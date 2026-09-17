"""Telemetry session format [P12-05].

Pure-Python (no database access) model of a *recorded* telemetry session: the
snapshots and radio readings one or more nodes actually reported, held in a JSON
document that can be replayed into any deployment to reproduce a bug.

Where the flight simulator [P3-15] generates telemetry from a model — waypoints,
a path-loss curve and an RNG — a session is a literal recording. Every position
and every dBm value is played back exactly as captured, so two replays of the
same file drive the system with identical input: the point of the exercise is
that a fault either reappears or it does not, with nothing random in between.

Entities are referenced by name, never by primary key. The database a session
was captured from is rarely the one it is replayed into, and a file carrying IDs
would land its readings on whichever rows happened to hold those numbers.

The value types are shared with ``data.simulation`` rather than restated here,
so a captured session and a simulated flight describe a radio the same way.

Coordinates follow the project GIS convention: [longitude, latitude, altitude]
in degrees/degrees/metres.
"""

from __future__ import annotations

import datetime
import math
from dataclasses import dataclass
from typing import Any, Iterator

from .simulation import GroundStationSpec, Position, RadioSpec

# Bumped only when a change would stop an older reader from replaying a file
# correctly; a reader refuses anything newer than it understands.
SESSION_VERSION = 1


class SessionError(ValueError):
    """Raised when a session document is malformed."""


@dataclass(frozen=True)
class SessionReading:
    """One radio reading, with its receiver named rather than numbered."""

    radio_type: str
    band: str
    rssi_dbm: int
    ground_station: str | None = None
    relay_node: str | None = None
    snr_db: float | None = None

    def as_dict(self) -> dict[str, Any]:
        document: dict[str, Any] = {"radio_type": self.radio_type, "band": self.band, "rssi_dbm": self.rssi_dbm}
        if self.ground_station is not None:
            document["ground_station"] = self.ground_station
        if self.relay_node is not None:
            document["relay_node"] = self.relay_node
        document["snr_db"] = self.snr_db
        return document


@dataclass(frozen=True)
class SessionSnapshot:
    """One reported position, placed on the session's own clock.

    ``offset_s`` is seconds from the start of the session. Recording the gaps
    rather than the wall-clock times is what lets a session be replayed at any
    hour and still reproduce the timing the bug depended on.
    """

    node: str
    offset_s: float
    position: Position
    readings: tuple[SessionReading, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "node": self.node,
            "offset_s": self.offset_s,
            "position": self.position.as_dict(),
            "readings": [reading.as_dict() for reading in self.readings],
        }


@dataclass(frozen=True)
class NodeSpec:
    """A node and the radios it carried, enough to recreate the rows."""

    name: str
    radios: tuple[RadioSpec, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "radios": [{"radio_type": radio.radio_type, "bands": list(radio.bands)} for radio in self.radios],
        }


@dataclass(frozen=True)
class Session:
    name: str
    recorded_at: datetime.datetime
    nodes: tuple[NodeSpec, ...]
    ground_stations: tuple[GroundStationSpec, ...]
    snapshots: tuple[SessionSnapshot, ...]
    # Free-form provenance (which deployment, which filters, when exported).
    # Carried through untouched: it is for the human reading the file.
    source: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, document: Any) -> "Session":
        if not isinstance(document, dict):
            raise SessionError("Session must be a JSON object")

        version = document.get("version", SESSION_VERSION)
        if not isinstance(version, int) or isinstance(version, bool):
            raise SessionError("'version' must be an integer")
        if version > SESSION_VERSION:
            raise SessionError(
                f"Session format version {version} is newer than this tool understands (max {SESSION_VERSION})"
            )

        recorded_at = _parse_timestamp(document.get("recorded_at"), "recorded_at")

        nodes = tuple(_parse_node(entry) for entry in _require(document, "nodes", list))
        if not nodes:
            raise SessionError("'nodes' must list at least one node")
        _reject_duplicates([node.name for node in nodes], "nodes")

        stations = tuple(_parse_station(entry) for entry in document.get("ground_stations") or [])
        _reject_duplicates([station.name for station in stations], "ground_stations")

        raw_snapshots = _require(document, "snapshots", list)
        if not raw_snapshots:
            raise SessionError("'snapshots' must contain at least one snapshot")

        bands_by_node = {node.name: {radio.radio_type: set(radio.bands) for radio in node.radios} for node in nodes}
        station_names = {station.name for station in stations}
        snapshots = tuple(
            _parse_snapshot(entry, index, recorded_at, bands_by_node, station_names)
            for index, entry in enumerate(raw_snapshots)
        )
        for previous, current in zip(snapshots, snapshots[1:], strict=False):
            if current.offset_s < previous.offset_s:
                raise SessionError(
                    f"snapshots must be ordered by time: offset_s {current.offset_s} follows {previous.offset_s}"
                )

        return cls(
            name=str(document.get("name") or "unnamed session"),
            recorded_at=recorded_at,
            nodes=nodes,
            ground_stations=stations,
            snapshots=snapshots,
            source=document.get("source") if isinstance(document.get("source"), dict) else None,
        )

    def as_dict(self) -> dict[str, Any]:
        document: dict[str, Any] = {
            "version": SESSION_VERSION,
            "name": self.name,
            "recorded_at": self.recorded_at.isoformat(),
        }
        if self.source is not None:
            document["source"] = self.source
        document["nodes"] = [node.as_dict() for node in self.nodes]
        document["ground_stations"] = [
            {"name": station.name, "position": station.position.as_dict()} for station in self.ground_stations
        ]
        document["snapshots"] = [snapshot.as_dict() for snapshot in self.snapshots]
        return document

    @property
    def duration_s(self) -> float:
        """Seconds between the first and last snapshot."""
        return self.snapshots[-1].offset_s - self.snapshots[0].offset_s

    @property
    def reading_count(self) -> int:
        return sum(len(snapshot.readings) for snapshot in self.snapshots)

    def node(self, name: str) -> NodeSpec:
        for node in self.nodes:
            if node.name == name:
                return node
        raise KeyError(name)

    def window(self, from_offset_s: float | None = None, to_offset_s: float | None = None) -> "Session":
        """A copy holding only the snapshots inside an offset window.

        Offsets stay on the original clock, so a window narrowed around a fault
        replays with the same spacing it had in the full recording.
        """
        low = from_offset_s if from_offset_s is not None else float("-inf")
        high = to_offset_s if to_offset_s is not None else float("inf")
        if low > high:
            raise SessionError("from_offset_s must not be greater than to_offset_s")
        selected = tuple(snapshot for snapshot in self.snapshots if low <= snapshot.offset_s <= high)
        if not selected:
            raise SessionError(f"No snapshots fall between {low:g} s and {high:g} s of the session")
        return Session(
            name=self.name,
            recorded_at=self.recorded_at,
            nodes=self.nodes,
            ground_stations=self.ground_stations,
            snapshots=selected,
            source=self.source,
        )

    def timeline(
        self, start_time: datetime.datetime, scale: float = 1.0
    ) -> Iterator[tuple[SessionSnapshot, datetime.datetime]]:
        """Pair each snapshot with a capture time, the first landing on ``start_time``.

        Rebasing keeps the intervals exactly as recorded while moving the whole
        session into a window the ingest API will accept. ``scale`` shrinks them
        in proportion — a replay running ten times faster stamps a recorded 10 s
        gap as 1 s — so capture times keep pace with the wall clock instead of
        running away into a future the ingest API rejects.
        """
        base = self.snapshots[0].offset_s
        for snapshot in self.snapshots:
            yield snapshot, start_time + datetime.timedelta(seconds=(snapshot.offset_s - base) * scale)

    def original_timeline(self) -> Iterator[tuple[SessionSnapshot, datetime.datetime]]:
        """Pair each snapshot with the time it was actually captured."""
        for snapshot in self.snapshots:
            yield snapshot, self.recorded_at + datetime.timedelta(seconds=snapshot.offset_s)


def snapshot_to_payload(
    snapshot: SessionSnapshot,
    captured_at: datetime.datetime,
    *,
    node_ids: dict[str, int],
    radio_ids: dict[tuple[str, str], int],
    station_ids: dict[str, int],
) -> dict[str, Any]:
    """Convert a recorded snapshot into a telemetry ingest API payload."""
    return {
        "node": node_ids[snapshot.node],
        "captured_at": captured_at.isoformat(),
        "position": snapshot.position.as_dict(),
        "radio_readings": [
            {
                "radio": radio_ids[(snapshot.node, reading.radio_type)],
                "ground_station": station_ids[reading.ground_station] if reading.ground_station else None,
                "relay_node": node_ids[reading.relay_node] if reading.relay_node else None,
                "band": reading.band,
                "rssi_dbm": reading.rssi_dbm,
                "snr_db": reading.snr_db,
            }
            for reading in snapshot.readings
        ],
    }


# --- parsing ----------------------------------------------------------------


def _require(document: dict[str, Any], key: str, expected: type) -> Any:
    if key not in document:
        raise SessionError(f"Missing required key '{key}'")
    value = document[key]
    if not isinstance(value, expected) or isinstance(value, bool):
        raise SessionError(f"'{key}' must be a {expected.__name__}")
    return value


def _reject_duplicates(names: list[str], label: str) -> None:
    seen = set()
    for name in names:
        if name in seen:
            raise SessionError(f"Duplicate entry '{name}' in {label}")
        seen.add(name)


def _parse_timestamp(value: Any, label: str) -> datetime.datetime:
    if not isinstance(value, str):
        raise SessionError(f"'{label}' must be an ISO-8601 timestamp string")
    try:
        parsed = datetime.datetime.fromisoformat(value)
    except ValueError as exc:
        raise SessionError(f"'{label}' is not a valid ISO-8601 timestamp: {value}") from exc
    if parsed.tzinfo is None:
        raise SessionError(f"'{label}' must carry a UTC offset so a replay cannot shift with the reader's timezone")
    return parsed


def _parse_position(entry: Any, label: str) -> Position:
    if not isinstance(entry, dict):
        raise SessionError(f"{label}: position must be an object")
    try:
        longitude = float(entry["longitude"])
        latitude = float(entry["latitude"])
        altitude = float(entry["altitude"])
    except (KeyError, TypeError, ValueError) as exc:
        raise SessionError(f"{label}: position needs longitude, latitude and altitude") from exc
    if not -180 <= longitude <= 180:
        raise SessionError(f"{label}: longitude must be between -180 and 180")
    if not -90 <= latitude <= 90:
        raise SessionError(f"{label}: latitude must be between -90 and 90")
    if not math.isfinite(altitude):
        raise SessionError(f"{label}: altitude must be a finite number")
    return Position(longitude, latitude, altitude)


def _parse_node(entry: Any) -> NodeSpec:
    if not isinstance(entry, dict):
        raise SessionError("Each nodes entry must be an object")
    name = entry.get("name")
    if not isinstance(name, str) or not name:
        raise SessionError("Each nodes entry needs a name")
    radios = tuple(_parse_radio(name, radio) for radio in entry.get("radios") or [])
    _reject_duplicates([radio.radio_type for radio in radios], f"nodes['{name}'].radios")
    return NodeSpec(name=name, radios=radios)


def _parse_radio(node_name: str, entry: Any) -> RadioSpec:
    if not isinstance(entry, dict):
        raise SessionError(f"Each radios entry for node '{node_name}' must be an object")
    radio_type = entry.get("radio_type")
    bands = entry.get("bands")
    if not isinstance(radio_type, str) or not radio_type:
        raise SessionError(f"Each radios entry for node '{node_name}' needs a radio_type")
    # An empty list is the model's own default and means "bands unconfigured",
    # which the ingest serializer takes as "accept any band".
    if not isinstance(bands, list) or not all(isinstance(band, str) and band for band in bands):
        raise SessionError(f"Radio '{radio_type}' on node '{node_name}' needs a list of band identifiers")
    return RadioSpec(radio_type=radio_type, bands=tuple(bands))


def _parse_station(entry: Any) -> GroundStationSpec:
    if not isinstance(entry, dict):
        raise SessionError("Each ground_stations entry must be an object")
    name = entry.get("name")
    if not isinstance(name, str) or not name:
        raise SessionError("Each ground_stations entry needs a name")
    return GroundStationSpec(name=name, position=_parse_position(entry.get("position"), f"ground_stations['{name}']"))


def _parse_snapshot(
    entry: Any,
    index: int,
    recorded_at: datetime.datetime,
    bands_by_node: dict[str, dict[str, set[str]]],
    station_names: set[str],
) -> SessionSnapshot:
    label = f"snapshots[{index}]"
    if not isinstance(entry, dict):
        raise SessionError(f"{label} must be an object")
    node = entry.get("node")
    if node not in bands_by_node:
        raise SessionError(f"{label} references unknown node '{node}'")
    offset_s = _parse_offset(entry, label, recorded_at)
    readings = tuple(
        _parse_reading(reading, f"{label}.readings[{i}]", node, bands_by_node, station_names)
        for i, reading in enumerate(entry.get("readings") or [])
    )
    return SessionSnapshot(
        node=node,
        offset_s=offset_s,
        position=_parse_position(entry.get("position"), label),
        readings=readings,
    )


def _parse_offset(entry: dict[str, Any], label: str, recorded_at: datetime.datetime) -> float:
    """Seconds from the start of the session.

    A capture writes ``offset_s``; a hand-written session may find it easier to
    paste the absolute ``captured_at`` from a log, so both are accepted.
    """
    if "offset_s" in entry:
        try:
            offset = float(entry["offset_s"])
        except (TypeError, ValueError) as exc:
            raise SessionError(f"{label}: offset_s must be a number") from exc
    elif "captured_at" in entry:
        offset = (_parse_timestamp(entry["captured_at"], f"{label}.captured_at") - recorded_at).total_seconds()
    else:
        raise SessionError(f"{label} needs either offset_s or captured_at")
    # JSON's NaN and Infinity literals compare false against every bound, so
    # without this they would pass the ordering checks and only blow up later,
    # inside timedelta.
    if not math.isfinite(offset):
        raise SessionError(f"{label}: offset_s must be a finite number")
    if offset < 0:
        raise SessionError(f"{label}: offset_s cannot be negative (the session starts at recorded_at)")
    return offset


def _parse_reading(
    entry: Any,
    label: str,
    node: str,
    bands_by_node: dict[str, dict[str, set[str]]],
    station_names: set[str],
) -> SessionReading:
    if not isinstance(entry, dict):
        raise SessionError(f"{label} must be an object")

    radio_type = entry.get("radio_type")
    bands = bands_by_node[node].get(radio_type) if isinstance(radio_type, str) else None
    if bands is None:
        raise SessionError(f"{label} references radio_type '{radio_type}', which node '{node}' does not carry")
    band = entry.get("band")
    if not isinstance(band, str) or not band:
        raise SessionError(f"{label} needs a band identifier")
    # An unconfigured radio accepts any band, exactly as the ingest serializer
    # does; a configured one only its own.
    if bands and band not in bands:
        raise SessionError(f"{label} references band '{band}', which is not configured on '{node}' {radio_type}")

    ground_station = entry.get("ground_station")
    relay_node = entry.get("relay_node")
    # Mirrors the radioreading_exactly_one_receiver check constraint, so a
    # malformed session fails on load rather than part way through a replay.
    if (ground_station is None) == (relay_node is None):
        raise SessionError(f"{label} needs exactly one of ground_station or relay_node")
    if ground_station is not None and ground_station not in station_names:
        raise SessionError(f"{label} references unknown ground station '{ground_station}'")
    if relay_node is not None and relay_node not in bands_by_node:
        raise SessionError(f"{label} references unknown relay node '{relay_node}'")

    # Deliberately not range-checked: an implausible dBm value is the kind of
    # thing a session is captured to reproduce, and the ingest serializer is
    # where the sensor range belongs.
    rssi = entry.get("rssi_dbm")
    if not isinstance(rssi, int) or isinstance(rssi, bool):
        raise SessionError(f"{label}: rssi_dbm must be an integer")

    snr_db = entry.get("snr_db")
    if snr_db is not None:
        try:
            snr_db = float(snr_db)
        except (TypeError, ValueError) as exc:
            raise SessionError(f"{label}: snr_db must be a number or null") from exc
        if not math.isfinite(snr_db):
            raise SessionError(f"{label}: snr_db must be a finite number or null")

    return SessionReading(
        radio_type=radio_type,
        band=band,
        rssi_dbm=rssi,
        ground_station=ground_station,
        relay_node=relay_node,
        snr_db=snr_db,
    )
