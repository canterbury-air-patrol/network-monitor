import pytest
from django.contrib.gis.geos import Point
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import GroundStation, Node, NodeSnapshot, Radio, RadioReading


def make_node(name="node-01"):
    return Node.objects.create(name=name)


def make_snapshot(node, alt=100):
    return NodeSnapshot.objects.create(
        node=node,
        captured_at=timezone.now(),
        position=Point(172.5, -43.5, alt, srid=4326),
    )


def make_station(name="base-alpha"):
    return GroundStation.objects.create(name=name, position=Point(172.5, -43.5, 10, srid=4326))


@pytest.mark.django_db
def test_node_str():
    node = make_node("alpha")
    assert str(node) == "alpha"


@pytest.mark.django_db
def test_radio_unique_per_node_and_type():
    node = make_node()
    Radio.objects.create(node=node, radio_type=Radio.RadioType.WIFI, bands=["2.4GHz"])
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Radio.objects.create(node=node, radio_type=Radio.RadioType.WIFI, bands=["5GHz"])


@pytest.mark.django_db
def test_radio_different_types_allowed_on_same_node():
    node = make_node()
    Radio.objects.create(node=node, radio_type=Radio.RadioType.WIFI)
    Radio.objects.create(node=node, radio_type=Radio.RadioType.LORA)
    assert node.radios.count() == 2


@pytest.mark.django_db
def test_radio_bands_clean_rejects_non_list():
    from django.core.exceptions import ValidationError

    node = make_node()
    radio = Radio(node=node, radio_type=Radio.RadioType.WIFI, bands="2.4GHz")
    with pytest.raises(ValidationError, match="list"):
        radio.full_clean()


@pytest.mark.django_db
def test_radio_bands_clean_rejects_non_string_elements():
    from django.core.exceptions import ValidationError

    node = make_node()
    radio = Radio(node=node, radio_type=Radio.RadioType.WIFI, bands=[2400])
    with pytest.raises(ValidationError, match="string"):
        radio.full_clean()


@pytest.mark.django_db
def test_radio_bands_clean_strips_whitespace():
    node = make_node()
    radio = Radio(node=node, radio_type=Radio.RadioType.WIFI, bands=["  2.4GHz  ", " 5GHz"])
    radio.full_clean()
    assert radio.bands == ["2.4GHz", "5GHz"]


@pytest.mark.django_db
def test_snapshot_stores_3d_position():
    node = make_node()
    snap = make_snapshot(node, alt=250)
    snap.refresh_from_db()
    assert snap.position.z == 250


@pytest.mark.django_db
def test_snapshot_received_at_set_automatically():
    node = make_node()
    snap = make_snapshot(node)
    assert snap.received_at is not None


@pytest.mark.django_db
def test_ground_station_name_unique():
    make_station("base-alpha")
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            make_station("base-alpha")


@pytest.mark.django_db
def test_radio_reading_with_ground_station():
    node = make_node()
    radio = Radio.objects.create(node=node, radio_type=Radio.RadioType.LORA)
    snap = make_snapshot(node)
    station = make_station()
    reading = RadioReading.objects.create(
        snapshot=snap, radio=radio, ground_station=station, band="433MHz", rssi_dbm=-70
    )
    assert reading.ground_station == station
    assert reading.relay_node is None


@pytest.mark.django_db
def test_radio_reading_with_relay_node():
    node = make_node("search-01")
    relay = make_node("relay-01")
    radio = Radio.objects.create(node=node, radio_type=Radio.RadioType.WIFI)
    snap = make_snapshot(node)
    reading = RadioReading.objects.create(snapshot=snap, radio=radio, relay_node=relay, band="2.4GHz", rssi_dbm=-65)
    assert reading.relay_node == relay
    assert reading.ground_station is None


@pytest.mark.django_db
def test_radio_reading_rejects_no_receiver():
    node = make_node()
    radio = Radio.objects.create(node=node, radio_type=Radio.RadioType.WIFI)
    snap = make_snapshot(node)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RadioReading.objects.create(snapshot=snap, radio=radio, band="2.4GHz", rssi_dbm=-70)


@pytest.mark.django_db
def test_radio_reading_rejects_both_receivers():
    node = make_node("tx-01")
    relay = make_node("relay-01")
    radio = Radio.objects.create(node=node, radio_type=Radio.RadioType.WIFI)
    snap = make_snapshot(node)
    station = make_station()
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RadioReading.objects.create(
                snapshot=snap,
                radio=radio,
                ground_station=station,
                relay_node=relay,
                band="2.4GHz",
                rssi_dbm=-70,
            )
