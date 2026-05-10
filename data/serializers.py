from rest_framework import serializers

from .models import GroundStation, Node, NodeSnapshot, Radio, RadioReading


class NodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Node
        fields = ["id", "name"]


class RadioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Radio
        fields = ["id", "node", "radio_type", "bands"]


class GroundStationSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroundStation
        fields = ["id", "name"]


class RadioReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = RadioReading
        fields = ["id", "radio", "ground_station", "relay_node", "band", "rssi_dbm", "snr_db"]


class NodeSnapshotSerializer(serializers.ModelSerializer):
    radio_readings = RadioReadingSerializer(many=True, read_only=True)
    position = serializers.SerializerMethodField()

    def get_position(self, obj):
        return {"longitude": obj.position.x, "latitude": obj.position.y, "altitude": obj.position.z}

    class Meta:
        model = NodeSnapshot
        fields = ["id", "node", "captured_at", "received_at", "position", "radio_readings"]
