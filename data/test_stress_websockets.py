"""Tests for the WebSocket stress harness [P12-03]."""

import asyncio
import json
from io import StringIO

import pytest
from channels.layers import channel_layers
from django.core.management import call_command
from django.core.management.base import CommandError


@pytest.fixture(autouse=True)
def in_memory_channel_layer(settings):
    """Keep the harness off Redis; it is the measuring rig under test, not the layer."""
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    channel_layers.backends = {}
    yield
    channel_layers.backends = {}


def run(**options) -> str:
    out = StringIO()
    call_command("stress_websockets", stdout=out, stderr=StringIO(), **options)
    return out.getvalue()


def run_json(**options) -> dict:
    return json.loads(run(json=True, **options))


def test_reports_full_delivery_on_the_broadcast_group():
    report = run_json(clients=4, messages=6, rate=0)

    assert report["clients"] == 4
    assert report["groups"] == ["nodes"]
    assert report["messages_published"] == 6
    assert report["publish_errors"] == 0
    # Every client is subscribed to the one group, so each broadcast lands four times.
    assert report["expected_deliveries"] == 24
    assert report["received"] == 24
    assert report["dropped"] == 0
    assert report["drop_rate_percent"] == 0.0
    assert report["malformed"] == 0


def test_reports_latency_percentiles():
    latency = run_json(clients=3, messages=5, rate=0)["latency_ms"]

    assert latency["min"] <= latency["p50"] <= latency["p95"] <= latency["p99"] <= latency["max"]
    # In-process delivery is quick, but it is never instant or negative.
    assert 0 < latency["min"] < 1000


def test_spreads_clients_over_per_node_groups():
    report = run_json(clients=5, nodes=2, messages=4, rate=0)

    assert report["groups"] == ["node.1", "node.2"]
    # Clients round-robin over the groups (3 on node.1, 2 on node.2) and the
    # broadcasts do the same (2 per group).
    assert report["expected_deliveries"] == 3 * 2 + 2 * 2
    assert report["received"] == report["expected_deliveries"]
    assert report["worst_client"]["received"] == report["worst_client"]["expected"]


def test_publishing_to_a_group_leaves_other_subscribers_alone():
    # A client on node.2 must not be credited with node.1's broadcasts, which
    # would hide a routing regression behind a healthy-looking delivery count.
    report = run_json(clients=2, nodes=2, messages=2, rate=0)

    assert report["expected_deliveries"] == 2
    assert report["received"] == 2
    assert report["dropped"] == 0


def test_summary_names_the_layer_and_the_drop_rate():
    output = run(clients=2, messages=3, rate=0)

    assert "2 client(s), 3 broadcast(s), 1 group(s) via InMemoryChannelLayer" in output
    assert "6 / 6 (0 dropped, 0.00% drop rate)" in output
    assert "no messages dropped" in output


def test_run_timing_covers_the_drain_not_the_idle_grace():
    report = run_json(clients=2, messages=4, rate=0, grace=2)

    # The run ends at the last delivery: a two second idle grace must not be
    # billed to the throughput figures.
    assert report["publish_seconds"] <= report["run_seconds"] < 1.0
    assert report["delivery_rate_per_s"] > 0


def test_zero_grace_still_counts_the_messages_in_flight():
    report = run_json(clients=2, messages=4, rate=0, grace=0)

    # Asking for no idle wait must not cancel the receivers before they have
    # had a turn: messages still queued on the communicators are in flight,
    # not dropped.
    assert report["received"] == report["expected_deliveries"] == 8
    assert report["drop_rate_percent"] == 0.0


def test_run_timing_never_undercuts_a_slow_publisher(monkeypatch):
    """A send that outlives the last delivery must not shrink the run."""
    from channels.layers import InMemoryChannelLayer

    original = InMemoryChannelLayer.group_send
    sent = 0

    async def slow_last_send(self, group, message):
        nonlocal sent
        await original(self, group, message)
        sent += 1
        if sent == 3:
            # The layer is still working after every message has landed; the
            # window that gets billed has to cover it, or the delivery rate is
            # reported against a run shorter than the publisher itself.
            await asyncio.sleep(0.3)

    monkeypatch.setattr(InMemoryChannelLayer, "group_send", slow_last_send)
    report = run_json(clients=1, messages=3, rate=0)

    assert report["publish_seconds"] >= 0.3
    assert report["run_seconds"] >= report["publish_seconds"]
    assert report["delivery_rate_per_s"] <= 3 / 0.3


def test_rate_limiting_paces_the_publisher():
    report = run_json(clients=1, messages=4, rate=20)

    # Four messages at 20/s cannot be published faster than the three gaps
    # between them; the pacing keeps a long run from becoming a burst test.
    assert report["publish_seconds"] >= 0.15


def test_payload_bytes_pads_the_broadcast():
    report = run_json(clients=1, messages=1, rate=0, payload_bytes=1024)

    assert report["settings"]["payload_bytes"] == 1024


def test_p95_threshold_fails_the_command():
    with pytest.raises(CommandError, match="exceeds --max-p95-ms"):
        run(clients=2, messages=2, rate=0, max_p95_ms=0.0)


def test_drop_rate_threshold_passes_a_clean_run():
    report = run_json(clients=2, messages=2, rate=0, max_drop_rate=0.0)

    assert report["drop_rate_percent"] == 0.0


@pytest.mark.parametrize(
    "options,message",
    [
        ({"clients": 0}, "--clients must be at least 1"),
        ({"messages": 0}, "--messages must be at least 1"),
        ({"rate": -1}, "--rate cannot be negative"),
        ({"nodes": -1}, "--nodes cannot be negative"),
        ({"payload_bytes": -1}, "--payload-bytes cannot be negative"),
        ({"grace": -1}, "--grace cannot be negative"),
        ({"connect_timeout": 0}, "--connect-timeout must be greater than zero"),
        ({"rate": float("nan")}, "--rate must be a finite number"),
        ({"rate": float("inf")}, "--rate must be a finite number"),
        ({"grace": float("nan")}, "--grace must be a finite number"),
        ({"connect_timeout": float("nan")}, "--connect-timeout must be a finite number"),
        ({"max_drop_rate": float("nan")}, "--max-drop-rate must be a finite number"),
        ({"max_p95_ms": float("nan")}, "--max-p95-ms must be a finite number"),
    ],
)
def test_rejects_nonsensical_options(options, message):
    with pytest.raises(CommandError, match=message):
        run(**options)


def test_rejects_an_origin_the_application_will_not_accept():
    with pytest.raises(CommandError, match="was refused"):
        run(clients=1, messages=1, rate=0, origin="http://evil.example.com")
