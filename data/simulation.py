"""Flight path simulation core [P3-15].

Pure-Python (no database access) model of a UAV flying a waypoint path while
ground stations record RSSI/SNR for each of its radios and bands. The Django
management command ``simulate_flight`` wraps this module to bootstrap the
matching database rows and feed the telemetry ingest API.

Keeping the model free of ORM imports means the scenario parsing, geometry and
signal maths are unit-testable without a PostGIS database, and the same
generator can drive the SDK conformance tests [P14-07] and the coverage-gap
alert scenarios [P10-11].

Coordinates follow the project GIS convention: [longitude, latitude, altitude]
in degrees/degrees/metres.
"""

from __future__ import annotations

import datetime
import math
import random
from dataclasses import dataclass, field
from typing import Any, Iterator

# Serializer bounds mirrored from data.serializers so generated readings are
# always accepted by the ingest API.
RSSI_MIN_DBM = -150
RSSI_MAX_DBM = 0

EARTH_RADIUS_M = 6_371_008.8

# Log-distance path loss defaults, roughly representative of a 2.4 GHz link
# with a mast-mounted omni at the ground station.
DEFAULT_TX_POWER_DBM = 20.0
DEFAULT_REFERENCE_LOSS_DB = 40.0
DEFAULT_PATH_LOSS_EXPONENT = 2.2
DEFAULT_NOISE_SIGMA_DB = 1.5
DEFAULT_NOISE_FLOOR_DBM = -95.0
DEFAULT_SENSITIVITY_DBM = -95.0
DEFAULT_SAMPLE_INTERVAL_S = 2.0
DEFAULT_GROUND_SPEED_MPS = 12.0


class ScenarioError(ValueError):
    """Raised when a scenario document is malformed."""


@dataclass(frozen=True)
class LinkProfile:
    """Radio-link parameters used to turn a distance into an RSSI value."""

    tx_power_dbm: float = DEFAULT_TX_POWER_DBM
    reference_loss_db: float = DEFAULT_REFERENCE_LOSS_DB
    path_loss_exponent: float = DEFAULT_PATH_LOSS_EXPONENT
    noise_sigma_db: float = DEFAULT_NOISE_SIGMA_DB
    noise_floor_dbm: float | None = DEFAULT_NOISE_FLOOR_DBM
    sensitivity_dbm: float = DEFAULT_SENSITIVITY_DBM
    max_range_m: float | None = None
    # A fixed value short-circuits the path loss model entirely, which is how a
    # scenario pins an exact RadioReading value for a radio/band/station.
    rssi_dbm: int | None = None
    enabled: bool = True

    def merged(self, overrides: dict[str, Any]) -> "LinkProfile":
        known = {f.name for f in self.__dataclass_fields__.values()}
        unknown = set(overrides) - known
        if unknown:
            raise ScenarioError(f"Unknown link parameter(s): {', '.join(sorted(unknown))}")
        return LinkProfile(**{**self.as_dict(), **overrides})

    def as_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.__dataclass_fields__}


@dataclass(frozen=True)
class Position:
    longitude: float
    latitude: float
    altitude: float

    def as_dict(self) -> dict[str, float]:
        return {"longitude": self.longitude, "latitude": self.latitude, "altitude": self.altitude}


@dataclass(frozen=True)
class GroundStationSpec:
    name: str
    position: Position


@dataclass(frozen=True)
class RadioSpec:
    radio_type: str
    bands: tuple[str, ...]


@dataclass(frozen=True)
class Dropout:
    """Window (in seconds from the start of the flight) where a station is deaf."""

    ground_station: str
    from_s: float
    to_s: float

    def covers(self, elapsed_s: float) -> bool:
        return self.from_s <= elapsed_s < self.to_s


@dataclass(frozen=True)
class SimulatedReading:
    radio_type: str
    band: str
    ground_station: str
    rssi_dbm: int
    snr_db: float | None


@dataclass(frozen=True)
class SimulatedSnapshot:
    node: str
    captured_at: datetime.datetime
    elapsed_s: float
    position: Position
    readings: tuple[SimulatedReading, ...]


@dataclass
class Scenario:
    name: str
    node: str
    radios: tuple[RadioSpec, ...]
    ground_stations: tuple[GroundStationSpec, ...]
    waypoints: tuple[Position, ...]
    ground_speed_mps: float = DEFAULT_GROUND_SPEED_MPS
    sample_interval_s: float = DEFAULT_SAMPLE_INTERVAL_S
    seed: int | None = None
    link_defaults: LinkProfile = field(default_factory=LinkProfile)
    # Overrides keyed most-specific-last; see Scenario.link_profile().
    link_overrides: tuple[tuple[dict[str, str], dict[str, Any]], ...] = ()
    dropouts: tuple[Dropout, ...] = ()

    @classmethod
    def from_dict(cls, document: Any) -> "Scenario":
        if not isinstance(document, dict):
            raise ScenarioError("Scenario must be a JSON object")

        uav = _require(document, "uav", dict)
        node = _require(uav, "node", str)
        radios = tuple(_parse_radio(entry) for entry in _require(uav, "radios", list))
        if not radios:
            raise ScenarioError("uav.radios must list at least one radio")

        stations = tuple(_parse_station(entry) for entry in _require(document, "ground_stations", list))
        if not stations:
            raise ScenarioError("ground_stations must list at least one station")
        _reject_duplicates([station.name for station in stations], "ground_stations")
        _reject_duplicates([radio.radio_type for radio in radios], "uav.radios")

        waypoints = tuple(_parse_position(entry, "waypoints") for entry in _require(document, "waypoints", list))
        if len(waypoints) < 2:
            raise ScenarioError("waypoints must contain at least two points")

        link_defaults = LinkProfile().merged(document.get("link_defaults") or {})
        overrides = tuple(_parse_override(entry) for entry in document.get("links") or [])
        dropouts = tuple(_parse_dropout(entry) for entry in document.get("dropouts") or [])

        station_names = {station.name for station in stations}
        radio_types = {radio.radio_type for radio in radios}
        for selector, _ in overrides:
            _check_selector(selector, station_names, radio_types, radios)
        for dropout in dropouts:
            if dropout.ground_station not in station_names:
                raise ScenarioError(f"dropouts references unknown ground station '{dropout.ground_station}'")

        scenario = cls(
            name=document.get("name") or "unnamed scenario",
            node=node,
            radios=radios,
            ground_stations=stations,
            waypoints=waypoints,
            ground_speed_mps=_positive(uav.get("ground_speed_mps", DEFAULT_GROUND_SPEED_MPS), "uav.ground_speed_mps"),
            sample_interval_s=_positive(
                document.get("sample_interval_s", DEFAULT_SAMPLE_INTERVAL_S), "sample_interval_s"
            ),
            seed=document.get("seed"),
            link_defaults=link_defaults,
            link_overrides=overrides,
            dropouts=dropouts,
        )
        return scenario

    def link_profile(self, radio_type: str, band: str, ground_station: str) -> LinkProfile:
        """Resolve the profile for one link, applying overrides in file order.

        Every override whose selector matches is applied, so a broad rule
        (``{"band": "5GHz"}``) can set the exponent while a later, narrower one
        pins an exact ``rssi_dbm`` for a single station.
        """
        profile = self.link_defaults
        for selector, values in self.link_overrides:
            if _selector_matches(selector, radio_type, band, ground_station):
                profile = profile.merged(values)
        return profile

    def station(self, name: str) -> GroundStationSpec:
        for station in self.ground_stations:
            if station.name == name:
                return station
        raise KeyError(name)

    @property
    def path_length_m(self) -> float:
        return sum(distance_3d(start, end) for start, end in zip(self.waypoints, self.waypoints[1:], strict=False))

    @property
    def duration_s(self) -> float:
        return self.path_length_m / self.ground_speed_mps

    def sample_span_s(self, loops: int = 1) -> float:
        """Wall-clock span covered by the emitted samples.

        Slightly longer than ``duration_s``: the path is sampled on a fixed
        interval and the final waypoint is always emitted, so the last sample
        sits on the interval boundary at or after the end of the flight.
        """
        per_lap = len(sample_path(self.waypoints, self.ground_speed_mps, self.sample_interval_s))
        total = per_lap + (loops - 1) * (per_lap - 1)
        return (total - 1) * self.sample_interval_s


def _require(document: dict[str, Any], key: str, expected: type) -> Any:
    if key not in document:
        raise ScenarioError(f"Missing required key '{key}'")
    value = document[key]
    if not isinstance(value, expected) or isinstance(value, bool):
        raise ScenarioError(f"'{key}' must be a {expected.__name__}")
    return value


def _positive(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ScenarioError(f"'{label}' must be a number") from exc
    if number <= 0:
        raise ScenarioError(f"'{label}' must be greater than zero")
    return number


def _reject_duplicates(names: list[str], label: str) -> None:
    seen = set()
    for name in names:
        if name in seen:
            raise ScenarioError(f"Duplicate entry '{name}' in {label}")
        seen.add(name)


def _parse_position(entry: Any, label: str) -> Position:
    if not isinstance(entry, dict):
        raise ScenarioError(f"Each {label} entry must be an object")
    try:
        longitude = float(entry["longitude"])
        latitude = float(entry["latitude"])
        altitude = float(entry["altitude"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ScenarioError(f"Each {label} entry needs longitude, latitude and altitude") from exc
    if not -180 <= longitude <= 180:
        raise ScenarioError(f"{label}: longitude must be between -180 and 180")
    if not -90 <= latitude <= 90:
        raise ScenarioError(f"{label}: latitude must be between -90 and 90")
    return Position(longitude, latitude, altitude)


def _parse_station(entry: Any) -> GroundStationSpec:
    if not isinstance(entry, dict) or "name" not in entry:
        raise ScenarioError("Each ground_stations entry must be an object with a name")
    return GroundStationSpec(name=str(entry["name"]), position=_parse_position(entry, "ground_stations"))


def _parse_radio(entry: Any) -> RadioSpec:
    if not isinstance(entry, dict):
        raise ScenarioError("Each uav.radios entry must be an object")
    radio_type = entry.get("radio_type")
    bands = entry.get("bands")
    if not isinstance(radio_type, str) or not radio_type:
        raise ScenarioError("Each uav.radios entry needs a radio_type")
    if not isinstance(bands, list) or not bands or not all(isinstance(band, str) and band for band in bands):
        raise ScenarioError(f"Radio '{radio_type}' needs a non-empty list of band identifiers")
    return RadioSpec(radio_type=radio_type, bands=tuple(bands))


def _parse_override(entry: Any) -> tuple[dict[str, str], dict[str, Any]]:
    if not isinstance(entry, dict):
        raise ScenarioError("Each links entry must be an object")
    selector = {key: str(entry[key]) for key in ("radio_type", "band", "ground_station") if key in entry}
    # "comment" is the scenario author's stand-in for JSON comments; ignore it.
    ignored = ("radio_type", "band", "ground_station", "comment")
    values = {key: value for key, value in entry.items() if key not in ignored}
    if not values:
        raise ScenarioError("Each links entry must set at least one link parameter")
    # Validate parameter names eagerly so a typo fails at load time.
    LinkProfile().merged(values)
    return selector, values


def _parse_dropout(entry: Any) -> Dropout:
    if not isinstance(entry, dict):
        raise ScenarioError("Each dropouts entry must be an object")
    try:
        station = str(entry["ground_station"])
        from_s = float(entry["from_s"])
        to_s = float(entry["to_s"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ScenarioError("Each dropouts entry needs ground_station, from_s and to_s") from exc
    if to_s <= from_s:
        raise ScenarioError("dropouts: to_s must be greater than from_s")
    return Dropout(ground_station=station, from_s=from_s, to_s=to_s)


def _check_selector(
    selector: dict[str, str], station_names: set[str], radio_types: set[str], radios: tuple[RadioSpec, ...]
) -> None:
    station = selector.get("ground_station")
    if station is not None and station not in station_names:
        raise ScenarioError(f"links references unknown ground station '{station}'")
    radio_type = selector.get("radio_type")
    if radio_type is not None and radio_type not in radio_types:
        raise ScenarioError(f"links references unknown radio_type '{radio_type}'")
    band = selector.get("band")
    if band is not None and not any(band in radio.bands for radio in radios):
        raise ScenarioError(f"links references unknown band '{band}'")


def _selector_matches(selector: dict[str, str], radio_type: str, band: str, ground_station: str) -> bool:
    values = {"radio_type": radio_type, "band": band, "ground_station": ground_station}
    return all(values[key] == expected for key, expected in selector.items())


def distance_3d(start: Position, end: Position) -> float:
    """Slant distance in metres between two positions (haversine + altitude)."""
    lat1, lat2 = math.radians(start.latitude), math.radians(end.latitude)
    dlat = lat2 - lat1
    dlon = math.radians(end.longitude - start.longitude)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    horizontal = 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))
    vertical = end.altitude - start.altitude
    return math.hypot(horizontal, vertical)


def interpolate(start: Position, end: Position, fraction: float) -> Position:
    """Linear interpolation between two waypoints.

    Flight legs in a UAV mission are short enough (kilometres) that linear
    interpolation in degrees is indistinguishable from a great-circle path.
    """
    return Position(
        longitude=start.longitude + (end.longitude - start.longitude) * fraction,
        latitude=start.latitude + (end.latitude - start.latitude) * fraction,
        altitude=start.altitude + (end.altitude - start.altitude) * fraction,
    )


def sample_path(waypoints: tuple[Position, ...], ground_speed_mps: float, interval_s: float) -> list[Position]:
    """Sample a waypoint path at a fixed time interval, ending on the last waypoint."""
    legs = [(start, end, distance_3d(start, end)) for start, end in zip(waypoints, waypoints[1:], strict=False)]
    total_m = sum(length for _, _, length in legs)
    if total_m == 0:
        raise ScenarioError("waypoints must describe a path with non-zero length")
    step_m = ground_speed_mps * interval_s
    positions: list[Position] = []
    travelled = 0.0
    while travelled < total_m:
        positions.append(_position_at(legs, travelled))
        travelled += step_m
    positions.append(waypoints[-1])
    return positions


def _position_at(legs: list[tuple[Position, Position, float]], travelled_m: float) -> Position:
    remaining = travelled_m
    for start, end, length in legs:
        if length == 0:
            continue
        if remaining <= length:
            return interpolate(start, end, remaining / length)
        remaining -= length
    return legs[-1][1]


def _rssi_for(profile: LinkProfile, distance_m: float, rng: random.Random) -> int | None:
    """Return the RSSI in dBm for a link, or None when the link is not heard."""
    if not profile.enabled:
        return None
    if profile.max_range_m is not None and distance_m > profile.max_range_m:
        return None
    if profile.rssi_dbm is not None:
        rssi = float(profile.rssi_dbm)
    else:
        # Log-distance path loss, floored at 1 m so the log stays finite when the
        # UAV passes directly over a station.
        reference_m = max(distance_m, 1.0)
        path_loss = profile.reference_loss_db + 10 * profile.path_loss_exponent * math.log10(reference_m)
        rssi = profile.tx_power_dbm - path_loss
    if profile.noise_sigma_db:
        rssi += rng.gauss(0.0, profile.noise_sigma_db)
    if rssi < profile.sensitivity_dbm:
        return None
    return int(round(max(RSSI_MIN_DBM, min(RSSI_MAX_DBM, rssi))))


def simulate(
    scenario: Scenario,
    start_time: datetime.datetime,
    loops: int = 1,
    rng: random.Random | None = None,
) -> Iterator[SimulatedSnapshot]:
    """Yield one snapshot per sample interval along the scenario's flight path.

    ``loops`` repeats the path (the duplicated waypoint between laps is dropped)
    so a short path can drive a long-running dev session.
    """
    if loops < 1:
        raise ValueError("loops must be at least 1")
    rng = rng if rng is not None else random.Random(scenario.seed)
    positions = sample_path(scenario.waypoints, scenario.ground_speed_mps, scenario.sample_interval_s)
    if loops > 1:
        positions = positions + [position for _ in range(loops - 1) for position in positions[1:]]

    for index, position in enumerate(positions):
        elapsed_s = index * scenario.sample_interval_s
        yield SimulatedSnapshot(
            node=scenario.node,
            captured_at=start_time + datetime.timedelta(seconds=elapsed_s),
            elapsed_s=elapsed_s,
            position=position,
            readings=tuple(_readings_at(scenario, position, elapsed_s, rng)),
        )


def _readings_at(
    scenario: Scenario, position: Position, elapsed_s: float, rng: random.Random
) -> Iterator[SimulatedReading]:
    for station in scenario.ground_stations:
        if any(d.ground_station == station.name and d.covers(elapsed_s) for d in scenario.dropouts):
            continue
        distance_m = distance_3d(position, station.position)
        for radio in scenario.radios:
            for band in radio.bands:
                profile = scenario.link_profile(radio.radio_type, band, station.name)
                rssi = _rssi_for(profile, distance_m, rng)
                if rssi is None:
                    continue
                snr = None if profile.noise_floor_dbm is None else round(rssi - profile.noise_floor_dbm, 1)
                yield SimulatedReading(
                    radio_type=radio.radio_type,
                    band=band,
                    ground_station=station.name,
                    rssi_dbm=rssi,
                    snr_db=snr,
                )


def snapshot_to_payload(
    snapshot: SimulatedSnapshot,
    node_id: int,
    radio_ids: dict[str, int],
    station_ids: dict[str, int],
) -> dict[str, Any]:
    """Convert a simulated snapshot into a telemetry ingest API payload."""
    return {
        "node": node_id,
        "captured_at": snapshot.captured_at.isoformat(),
        "position": snapshot.position.as_dict(),
        "radio_readings": [
            {
                "radio": radio_ids[reading.radio_type],
                "ground_station": station_ids[reading.ground_station],
                "band": reading.band,
                "rssi_dbm": reading.rssi_dbm,
                "snr_db": reading.snr_db,
            }
            for reading in snapshot.readings
        ],
    }
