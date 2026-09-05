"""WebSocket stress harness [P12-03].

Opens a configurable number of concurrent WebSocket connections (50 by
default) against the real ASGI application, broadcasts telemetry through the
configured channel layer, and reports end-to-end message latency and drop
rate.

The connections are driven in-process through ``networkmonitor.asgi``, so the
origin validator, the URL routing and ``NodeStatusConsumer`` all run exactly as
they do in production while the numbers stay free of TCP and HTTP framing
noise. What is being measured is the channel layer: with the default
``channels_redis`` backend every broadcast makes a real round trip through
Redis, and a channel whose capacity is exhausted has its messages dropped —
which is precisely the failure this harness is meant to surface before a
mission does.

Examples::

    # Default sweep: 50 clients on the global broadcast group
    docker compose exec app ./manage.py stress_websockets

    # Heavier fan-out, machine-readable, failing the run on regressions
    docker compose exec app ./manage.py stress_websockets \\
        --clients 200 --messages 500 --rate 50 --json \\
        --max-drop-rate 0 --max-p95-ms 250
"""

from __future__ import annotations

import asyncio
import json
import math
import statistics
import time
from dataclasses import dataclass, field

from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.core.management.base import BaseCommand, CommandError

from networkmonitor.asgi import application

DEFAULT_CLIENTS = 50
DEFAULT_MESSAGES = 200
DEFAULT_RATE = 20.0
DEFAULT_PAYLOAD_BYTES = 256
DEFAULT_GRACE_S = 5.0
DEFAULT_CONNECT_TIMEOUT_S = 10.0

# How often the drain loop re-checks whether deliveries are still arriving.
_DRAIN_POLL_S = 0.25

# A receiver blocks on the socket rather than polling it: ``receive_from``
# cancels the consumer it is waiting on when its own timeout expires, so the
# drain loop stops the receivers instead of letting them time out. The value is
# only a backstop against a run that never finishes.
_RECEIVE_TIMEOUT_S = 3600.0

# A broadcast the consumer recognises; mirrors what the telemetry path sends.
_MESSAGE_TYPE = "node.snapshot"

_GLOBAL_GROUP = "nodes"
_GLOBAL_PATH = "/ws/nodes/"


@dataclass
class _Client:
    """One connected WebSocket and everything measured about it."""

    index: int
    group: str
    path: str
    communicator: WebsocketCommunicator
    expected: int = 0
    connect_s: float = 0.0
    received: int = 0
    malformed: int = 0
    last_arrival_s: float = 0.0
    latencies: list[float] = field(default_factory=list)


class Command(BaseCommand):
    help = "Stress the Channels layer with concurrent WebSocket clients; report latency and drop rate."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clients", type=int, default=DEFAULT_CLIENTS, help="Concurrent WebSocket connections to open."
        )
        parser.add_argument(
            "--messages", type=int, default=DEFAULT_MESSAGES, help="Broadcasts to publish across the run."
        )
        parser.add_argument(
            "--rate",
            type=float,
            default=DEFAULT_RATE,
            help="Broadcasts per second (0 publishes as fast as the layer accepts them).",
        )
        parser.add_argument(
            "--nodes",
            type=int,
            default=0,
            help="Spread clients over this many per-node groups; 0 puts every client on the global group.",
        )
        parser.add_argument(
            "--payload-bytes",
            type=int,
            default=DEFAULT_PAYLOAD_BYTES,
            help="Approximate serialized size of each broadcast, padded to size.",
        )
        parser.add_argument(
            "--grace",
            type=float,
            default=DEFAULT_GRACE_S,
            help="Seconds of silence after the last delivery before the rest are counted as dropped.",
        )
        parser.add_argument(
            "--connect-timeout",
            type=float,
            default=DEFAULT_CONNECT_TIMEOUT_S,
            help="Seconds to wait for each client's handshake.",
        )
        parser.add_argument("--origin", default="http://localhost", help="Origin header sent with the handshake.")
        parser.add_argument("--json", action="store_true", help="Emit the report as JSON instead of a summary table.")
        parser.add_argument(
            "--max-drop-rate", type=float, help="Fail the command if the drop rate (percent) exceeds this."
        )
        parser.add_argument("--max-p95-ms", type=float, help="Fail the command if p95 latency exceeds this.")

    def handle(self, *args, **options):
        self._validate(options)
        report = asyncio.run(self._run(options))

        if options["json"]:
            self.stdout.write(json.dumps(report, indent=2))
        else:
            self._write_summary(report)

        self._enforce_thresholds(report, options)

    # --- option handling --------------------------------------------------

    def _validate(self, options) -> None:
        if options["clients"] < 1:
            raise CommandError("--clients must be at least 1")
        if options["messages"] < 1:
            raise CommandError("--messages must be at least 1")
        if options["rate"] < 0:
            raise CommandError("--rate cannot be negative")
        if options["nodes"] < 0:
            raise CommandError("--nodes cannot be negative")
        if options["payload_bytes"] < 0:
            raise CommandError("--payload-bytes cannot be negative")
        if options["grace"] < 0:
            raise CommandError("--grace cannot be negative")
        if options["connect_timeout"] <= 0:
            raise CommandError("--connect-timeout must be greater than zero")

    def _enforce_thresholds(self, report: dict, options) -> None:
        failures = []
        limit = options["max_drop_rate"]
        if limit is not None and report["drop_rate_percent"] > limit:
            failures.append(f"drop rate {report['drop_rate_percent']:.2f}% exceeds --max-drop-rate {limit:g}%")
        limit = options["max_p95_ms"]
        if limit is not None:
            p95 = report["latency_ms"]["p95"]
            if p95 is None:
                failures.append("no messages arrived, so p95 latency cannot meet --max-p95-ms")
            elif p95 > limit:
                failures.append(f"p95 latency {p95:.2f} ms exceeds --max-p95-ms {limit:g} ms")
        if failures:
            raise CommandError("; ".join(failures))

    # --- the run ----------------------------------------------------------

    async def _run(self, options) -> dict:
        layer = get_channel_layer()
        if layer is None:
            raise CommandError("No channel layer is configured; check CHANNEL_LAYERS.")

        clients = self._build_clients(options)
        groups = self._plan_groups(clients, options)
        expected_total = self._assign_expectations(clients, groups, options["messages"])

        await self._connect_all(clients, options)
        sent_at: dict[int, float] = {}
        receivers = [asyncio.create_task(self._receive(client, sent_at)) for client in clients]
        started = time.perf_counter()
        try:
            published, publish_errors, publish_s = await self._publish(layer, sent_at, groups, options)
            await self._drain(clients, receivers, options["grace"])
            # The idle grace period is not part of the run: time it to the last
            # message that actually arrived.
            last_arrival = max((client.last_arrival_s for client in clients), default=0.0)
            run_s = last_arrival - started if last_arrival else publish_s
        finally:
            for task in receivers:
                task.cancel()
            await asyncio.gather(*receivers, return_exceptions=True)
            await self._disconnect_all(clients)

        return self._report(clients, options, expected_total, published, publish_errors, publish_s, run_s)

    def _build_clients(self, options) -> list[_Client]:
        headers = [(b"origin", options["origin"].encode()), (b"host", b"localhost")]
        clients = []
        for index in range(options["clients"]):
            if options["nodes"]:
                node_id = index % options["nodes"] + 1
                group, path = f"node.{node_id}", f"/ws/nodes/{node_id}/"
            else:
                group, path = _GLOBAL_GROUP, _GLOBAL_PATH
            clients.append(
                _Client(
                    index=index,
                    group=group,
                    path=path,
                    communicator=WebsocketCommunicator(application, path, headers=headers),
                )
            )
        return clients

    def _plan_groups(self, clients: list[_Client], options) -> list[str]:
        """The groups broadcasts cycle through, in a stable order."""
        if not options["nodes"]:
            return [_GLOBAL_GROUP]
        # Only groups with a subscriber are worth publishing to: with more
        # groups than clients the empty ones would otherwise dilute the run.
        return sorted({client.group for client in clients}, key=lambda name: int(name.split(".")[1]))

    def _assign_expectations(self, clients: list[_Client], groups: list[str], messages: int) -> int:
        """Messages each client should see, given round-robin publishing."""
        per_group = {
            group: messages // len(groups) + (1 if index < messages % len(groups) else 0)
            for index, group in enumerate(groups)
        }
        for client in clients:
            client.expected = per_group.get(client.group, 0)
        return sum(client.expected for client in clients)

    async def _connect_all(self, clients: list[_Client], options) -> None:
        async def connect(client: _Client) -> None:
            started = time.perf_counter()
            try:
                connected, detail = await client.communicator.connect(timeout=options["connect_timeout"])
            except asyncio.TimeoutError as exc:
                raise CommandError(
                    f"Client {client.index} did not finish its handshake on {client.path} "
                    f"within {options['connect_timeout']:g} s."
                ) from exc
            client.connect_s = time.perf_counter() - started
            if not connected:
                raise CommandError(f"Client {client.index} was refused on {client.path} (close code {detail}).")

        try:
            await asyncio.gather(*(connect(client) for client in clients))
        except Exception:
            await self._disconnect_all(clients)
            raise

    async def _publish(self, layer, sent_at: dict[int, float], groups: list[str], options) -> tuple[int, int, float]:
        payload_pad = self._padding(options["payload_bytes"])
        interval = 1 / options["rate"] if options["rate"] else 0.0
        published = 0
        errors = 0
        started = time.perf_counter()
        next_due = time.monotonic()
        for seq in range(options["messages"]):
            if interval:
                delay = next_due - time.monotonic()
                if delay > 0:
                    await asyncio.sleep(delay)
                next_due += interval
            group = groups[seq % len(groups)]
            message = {"type": _MESSAGE_TYPE, "data": {"seq": seq, "group": group, "pad": payload_pad}}
            sent_at[seq] = time.perf_counter()
            try:
                await layer.group_send(group, message)
                published += 1
            # A layer that refuses the send (ChannelFull, a dropped Redis
            # connection) is a result worth reporting, not a crash.
            except Exception as exc:
                errors += 1
                self.stderr.write(f"publish {seq} to {group} failed: {exc}")
        return published, errors, time.perf_counter() - started

    def _padding(self, payload_bytes: int) -> str:
        skeleton = json.dumps({"seq": 0, "group": _GLOBAL_GROUP, "pad": ""})
        return "x" * max(0, payload_bytes - len(skeleton))

    async def _receive(self, client: _Client, sent_at: dict[int, float]) -> None:
        while client.received < client.expected:
            raw = await client.communicator.receive_from(timeout=_RECEIVE_TIMEOUT_S)
            arrived = time.perf_counter()
            try:
                seq = json.loads(raw)["seq"]
                sent = sent_at[seq]
            except (KeyError, TypeError, ValueError):
                client.malformed += 1
                continue
            client.received += 1
            client.last_arrival_s = arrived
            client.latencies.append((arrived - sent) * 1000)

    async def _drain(self, clients: list[_Client], receivers: list[asyncio.Task], grace: float) -> None:
        """Wait out the tail of the broadcast, then give up on the rest.

        The window is measured from the last delivery rather than from the last
        broadcast: a layer under load can keep handing over messages long after
        the publisher stops, and cutting that short would report a backlog as a
        drop.
        """
        pending = set(receivers)
        delivered = -1
        deadline = time.monotonic() + grace
        while pending and time.monotonic() < deadline:
            _, pending = await asyncio.wait(pending, timeout=_DRAIN_POLL_S)
            total = sum(client.received for client in clients)
            if total != delivered:
                delivered = total
                deadline = time.monotonic() + grace

    async def _disconnect_all(self, clients: list[_Client]) -> None:
        await asyncio.gather(*(client.communicator.disconnect() for client in clients), return_exceptions=True)

    # --- reporting --------------------------------------------------------

    def _report(
        self,
        clients: list[_Client],
        options,
        expected: int,
        published: int,
        publish_errors: int,
        publish_s: float,
        run_s: float,
    ) -> dict:
        latencies = sorted(value for client in clients for value in client.latencies)
        received = sum(client.received for client in clients)
        dropped = expected - received
        worst = min(clients, key=lambda client: (client.received - client.expected, -client.index))
        connects = [client.connect_s * 1000 for client in clients]
        return {
            "clients": len(clients),
            "groups": sorted({client.group for client in clients}),
            "messages_published": published,
            "publish_errors": publish_errors,
            "publish_seconds": round(publish_s, 3),
            "publish_rate_per_s": round(published / publish_s, 2) if publish_s > 0 else None,
            "expected_deliveries": expected,
            "received": received,
            "dropped": dropped,
            "drop_rate_percent": round(dropped / expected * 100, 4) if expected else 0.0,
            "malformed": sum(client.malformed for client in clients),
            # Publishing plus however long the backlog took to clear, so a
            # layer that keeps delivering after the publisher stops is not
            # credited with the publisher's throughput.
            "run_seconds": round(run_s, 3),
            "delivery_rate_per_s": round(received / run_s, 2) if run_s > 0 else None,
            "connect_ms": {
                "mean": round(statistics.fmean(connects), 3),
                "max": round(max(connects), 3),
            },
            "latency_ms": {
                "min": _round(latencies[0]) if latencies else None,
                "mean": _round(statistics.fmean(latencies)) if latencies else None,
                "p50": _round(_percentile(latencies, 50)),
                "p95": _round(_percentile(latencies, 95)),
                "p99": _round(_percentile(latencies, 99)),
                "max": _round(latencies[-1]) if latencies else None,
            },
            "worst_client": {
                "index": worst.index,
                "group": worst.group,
                "received": worst.received,
                "expected": worst.expected,
            },
            "settings": {
                "rate_per_s": options["rate"],
                "payload_bytes": options["payload_bytes"],
                "grace_seconds": options["grace"],
                "channel_layer": _layer_backend(),
            },
        }

    def _write_summary(self, report: dict) -> None:
        latency = report["latency_ms"]
        write = self.stdout.write
        write(
            f"WebSocket stress test — {report['clients']} client(s), "
            f"{report['messages_published']} broadcast(s), {len(report['groups'])} group(s) "
            f"via {report['settings']['channel_layer']}"
        )
        write(f"  connections  mean {report['connect_ms']['mean']:.1f} ms, max {report['connect_ms']['max']:.1f} ms")
        publish_rate = report["publish_rate_per_s"]
        write(
            f"  published    {report['messages_published']} in {report['publish_seconds']:.2f} s "
            f"({publish_rate if publish_rate is not None else 'n/a'} msg/s), {report['publish_errors']} error(s)"
        )
        write(
            f"  delivered    {report['received']} / {report['expected_deliveries']} "
            f"({report['dropped']} dropped, {report['drop_rate_percent']:.2f}% drop rate)"
        )
        write(f"  latency      {_fmt_latency(latency)}")
        worst = report["worst_client"]
        write(f"  worst client #{worst['index']} on {worst['group']}: {worst['received']}/{worst['expected']}")
        if report["malformed"]:
            write(self.style.WARNING(f"  {report['malformed']} unrecognised frame(s) ignored"))
        style = self.style.SUCCESS if report["dropped"] == 0 else self.style.WARNING
        write(style(f"  {'no messages dropped' if report['dropped'] == 0 else 'messages were dropped'}"))


def _percentile(ordered: list[float], percent: float) -> float | None:
    """Nearest-rank percentile of an already sorted list."""
    if not ordered:
        return None
    rank = max(1, min(len(ordered), math.ceil(percent / 100 * len(ordered))))
    return ordered[rank - 1]


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 3)


def _fmt_latency(latency: dict) -> str:
    if latency["p50"] is None:
        return "no messages received"
    return " | ".join(
        f"{name} {latency[name]:.2f} ms" for name in ("min", "p50", "p95", "p99", "max") if latency[name] is not None
    )


def _layer_backend() -> str:
    layer = get_channel_layer()
    return type(layer).__name__ if layer else "none"
