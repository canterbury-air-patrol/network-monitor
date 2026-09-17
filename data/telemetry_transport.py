"""Ingest transports shared by the flight simulator [P3-15] and the replay tool [P12-05].

Both tools end up holding the same thing — telemetry ingest payloads, keyed by
primary key — and differ only in where those payloads came from: one generates
them from a path-loss model, the other reads them back from a recording. Giving
them one delivery path means a payload takes the identical route into the system
either way, which is what makes a replayed session comparable with the flight it
was captured from.

``orm`` writes straight to the database (fast, and it bypasses the ingest
serializer's freshness rules), ``http`` posts to a running server's ingest
endpoint so the real API path is exercised, and ``stdout`` emits JSON lines for
an external harness.
"""

from __future__ import annotations

import datetime
import json
import sys
import urllib.error
import urllib.request
from typing import Any, TextIO

from django.contrib.gis.geos import Point
from django.db import transaction
from django.utils import timezone

from .models import NodeSnapshot, RadioReading

TRANSPORT_CHOICES = ("orm", "http", "stdout")
DEFAULT_INGEST_URL = "http://localhost:8050/api/v1/telemetry/ingest/"


class TransportError(RuntimeError):
    """A batch could not be delivered; callers turn this into a CommandError."""


class Transport:
    """Somewhere a batch of ingest payloads can be sent."""

    def send(self, payloads: list[dict[str, Any]]) -> int:
        raise NotImplementedError


class OrmTransport(Transport):
    """Write rows directly, skipping the API.

    Nothing here re-validates the payload: the serializer's freshness window is
    exactly what a replay of a week-old session needs to sidestep.
    """

    @transaction.atomic
    def send(self, payloads: list[dict[str, Any]]) -> int:
        readings = []
        for payload in payloads:
            snapshot = NodeSnapshot.objects.create(
                node_id=payload["node"],
                captured_at=_as_datetime(payload["captured_at"]),
                position=_as_point(payload["position"]),
            )
            readings.extend(
                RadioReading(
                    snapshot=snapshot,
                    radio_id=reading["radio"],
                    ground_station_id=reading.get("ground_station"),
                    relay_node_id=reading.get("relay_node"),
                    band=reading["band"],
                    rssi_dbm=reading["rssi_dbm"],
                    snr_db=reading.get("snr_db"),
                )
                for reading in payload.get("radio_readings", [])
            )
        RadioReading.objects.bulk_create(readings)
        return len(payloads)


class HttpTransport(Transport):
    """POST the batch to a running server's telemetry ingest endpoint."""

    def __init__(self, url: str = DEFAULT_INGEST_URL, token: str | None = None) -> None:
        self.url = url
        self.token = token

    def send(self, payloads: list[dict[str, Any]]) -> int:
        request = urllib.request.Request(
            self.url,
            data=json.dumps(payloads, default=_json_default).encode(),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise TransportError(f"Ingest returned HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise TransportError(f"Cannot reach ingest endpoint {self.url}: {exc.reason}") from exc
        return len(payloads)


class StdoutTransport(Transport):
    """Emit one JSON payload per line for an external harness to consume."""

    def __init__(self, stream: TextIO | None = None) -> None:
        self.stream = stream if stream is not None else sys.stdout

    def send(self, payloads: list[dict[str, Any]]) -> int:
        for payload in payloads:
            json.dump(payload, self.stream, default=_json_default)
            self.stream.write("\n")
        self.stream.flush()
        return len(payloads)


def build_transport(
    name: str,
    *,
    url: str = DEFAULT_INGEST_URL,
    token: str | None = None,
    stream: TextIO | None = None,
) -> Transport:
    if name == "orm":
        return OrmTransport()
    if name == "http":
        return HttpTransport(url=url, token=token)
    if name == "stdout":
        return StdoutTransport(stream=stream)
    raise ValueError(f"Unknown transport '{name}'")


def _as_datetime(value: Any) -> datetime.datetime:
    """Accept either a datetime or the ISO-8601 string a payload carries."""
    parsed = value if isinstance(value, datetime.datetime) else datetime.datetime.fromisoformat(value)
    return parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)


def _as_point(position: dict[str, float]) -> Point:
    return Point(position["longitude"], position["latitude"], position["altitude"], srid=4326)


def _json_default(value: Any) -> str:
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
