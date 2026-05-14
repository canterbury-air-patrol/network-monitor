import datetime

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from .factories import (
    GroundStationFactory,
    NodeFactory,
    NodeSnapshotFactory,
    RadioFactory,
    RadioReadingFactory,
)
from .serializers import NodeSerializer, NodeSnapshotSerializer, RadioSerializer


@pytest.fixture
def api_client():
    return APIClient()


# --- P1-13: Node and Radio serializer unit tests ---


@pytest.mark.django_db
def test_node_serializer_fields():
    node = NodeFactory(name="alpha")
    data = NodeSerializer(node).data
    assert data["name"] == "alpha"
    assert "id" in data


@pytest.mark.django_db
def test_radio_serializer_fields():
    radio = RadioFactory(bands=["2.4GHz", "5GHz"])
    data = RadioSerializer(radio).data
    assert data["radio_type"] == "wifi"
    assert data["bands"] == ["2.4GHz", "5GHz"]
    assert data["node"] == radio.node.pk


# --- P1-14: NodeSnapshot serializer unit tests ---


@pytest.mark.django_db
def test_snapshot_serializer_position():
    from django.contrib.gis.geos import Point

    snap = NodeSnapshotFactory(position=Point(172.5, -43.5, 342.0, srid=4326))
    data = NodeSnapshotSerializer(snap).data
    assert data["position"]["longitude"] == pytest.approx(172.5)
    assert data["position"]["latitude"] == pytest.approx(-43.5)
    assert data["position"]["altitude"] == pytest.approx(342.0)


@pytest.mark.django_db
def test_snapshot_serializer_nested_readings():
    node = NodeFactory()
    snap = NodeSnapshotFactory(node=node)
    radio = RadioFactory(node=node)
    station = GroundStationFactory()
    RadioReadingFactory(snapshot=snap, radio=radio, ground_station=station, band="2.4GHz", rssi_dbm=-60)
    RadioReadingFactory(snapshot=snap, radio=radio, ground_station=station, band="5GHz", rssi_dbm=-75)

    data = NodeSnapshotSerializer(snap).data
    readings = data["radio_readings"]
    assert len(readings) == 2
    rssi_by_band = {r["band"]: r["rssi_dbm"] for r in readings}
    assert rssi_by_band["2.4GHz"] == -60
    assert rssi_by_band["5GHz"] == -75


# --- P1-15: API integration tests ---


@pytest.mark.django_db
def test_nodes_list(api_client):
    NodeFactory.create_batch(3)
    response = api_client.get(reverse("data_api_v1:node-list"))
    assert response.status_code == 200
    assert response.data["count"] == 3


@pytest.mark.django_db
def test_nodes_detail(api_client):
    node = NodeFactory(name="test-node")
    response = api_client.get(reverse("data_api_v1:node-detail", args=[node.pk]))
    assert response.status_code == 200
    assert response.data["name"] == "test-node"


@pytest.mark.django_db
def test_radios_filter_by_node(api_client):
    node_a = NodeFactory()
    node_b = NodeFactory()
    RadioFactory(node=node_a)
    RadioFactory(node=node_b)
    response = api_client.get(reverse("data_api_v1:radio-list"), {"node": node_a.pk})
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["node"] == node_a.pk


@pytest.mark.django_db
def test_snapshots_ordered_newest_first(api_client):
    node = NodeFactory()
    older = NodeSnapshotFactory(node=node, captured_at=datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc))
    newer = NodeSnapshotFactory(node=node, captured_at=datetime.datetime(2026, 6, 1, tzinfo=datetime.timezone.utc))
    response = api_client.get(reverse("data_api_v1:snapshot-list"))
    assert response.status_code == 200
    ids = [r["id"] for r in response.data["results"]]
    assert ids.index(newer.pk) < ids.index(older.pk)


@pytest.mark.django_db
def test_snapshots_filter_by_node(api_client):
    node_a = NodeFactory()
    node_b = NodeFactory()
    NodeSnapshotFactory(node=node_a)
    NodeSnapshotFactory(node=node_b)
    response = api_client.get(reverse("data_api_v1:snapshot-list"), {"node": node_a.pk})
    assert response.status_code == 200
    assert response.data["count"] == 1


@pytest.mark.django_db
def test_readings_filter_by_snapshot(api_client):
    reading_a = RadioReadingFactory()
    reading_b = RadioReadingFactory()
    response = api_client.get(reverse("data_api_v1:radioreading-list"), {"snapshot": reading_a.snapshot.pk})
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == reading_a.pk
    _ = reading_b  # ensure second reading exists to confirm filtering


@pytest.mark.django_db
def test_readings_filter_by_radio(api_client):
    reading_a = RadioReadingFactory()
    reading_b = RadioReadingFactory()
    response = api_client.get(reverse("data_api_v1:radioreading-list"), {"radio": reading_a.radio.pk})
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == reading_a.pk
    _ = reading_b  # ensure second reading exists to confirm filtering
