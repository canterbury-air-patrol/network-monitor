import factory
from django.contrib.gis.geos import Point
from django.utils import timezone

from .models import GroundStation, Node, NodeSnapshot, Radio, RadioReading


class NodeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Node

    name = factory.Sequence(lambda n: f"node-{n:02d}")


class RadioFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Radio

    node = factory.SubFactory(NodeFactory)
    radio_type = Radio.RadioType.WIFI
    bands = factory.LazyFunction(lambda: ["2.4GHz"])


class NodeSnapshotFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = NodeSnapshot

    node = factory.SubFactory(NodeFactory)
    captured_at = factory.LazyFunction(timezone.now)
    position = factory.LazyFunction(lambda: Point(172.5, -43.5, 100.0, srid=4326))


class GroundStationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = GroundStation

    name = factory.Sequence(lambda n: f"station-{n:02d}")
    position = factory.LazyFunction(lambda: Point(172.5, -43.5, 10.0, srid=4326))


class RadioReadingFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = RadioReading

    snapshot = factory.SubFactory(NodeSnapshotFactory)
    radio = factory.SubFactory(RadioFactory)
    ground_station = factory.SubFactory(GroundStationFactory)
    band = "2.4GHz"
    rssi_dbm = -70
    snr_db = None
