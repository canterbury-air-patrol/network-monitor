import datetime

from django.conf import settings
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ErrorDetail

from .models import GroundStation, Node, NodeSnapshot, Radio, RadioReading

_ALTITUDE_MIN = -500
_ALTITUDE_MAX = 60_000
_RSSI_MIN = -150
_RSSI_MAX = 0


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


class PositionField(serializers.Field):
    def to_representation(self, value):
        return {"longitude": value.x, "latitude": value.y, "altitude": value.z}

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("position must be an object")
        try:
            lon = float(data["longitude"])
            lat = float(data["latitude"])
            alt = float(data["altitude"])
        except (KeyError, TypeError, ValueError) as exc:
            raise serializers.ValidationError("position must include longitude, latitude, and altitude") from exc
        if not -180 <= lon <= 180:
            raise serializers.ValidationError("longitude must be between -180 and 180")
        if not -90 <= lat <= 90:
            raise serializers.ValidationError("latitude must be between -90 and 90")
        if not _ALTITUDE_MIN <= alt <= _ALTITUDE_MAX:
            raise serializers.ValidationError(
                f"altitude {alt} m is implausible; expected {_ALTITUDE_MIN} to {_ALTITUDE_MAX} m",
                code="IMPLAUSIBLE_ALTITUDE",
            )
        return Point(lon, lat, alt, srid=4326)


class RadioReadingWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = RadioReading
        fields = ["radio", "ground_station", "relay_node", "band", "rssi_dbm", "snr_db"]

    def validate_rssi_dbm(self, value):
        if not _RSSI_MIN <= value <= _RSSI_MAX:
            raise serializers.ValidationError(
                f"rssi_dbm {value} is outside sensor range ({_RSSI_MIN} to {_RSSI_MAX} dBm)",
                code="RSSI_OUT_OF_RANGE",
            )
        return value

    def validate(self, attrs):
        radio = attrs.get("radio")
        band = attrs.get("band")
        if radio and band and radio.bands and band not in radio.bands:
            raise serializers.ValidationError(
                {"band": [ErrorDetail(f"'{band}' is not a configured band for radio {radio.pk}", code="UNKNOWN_BAND")]}
            )
        return attrs


class NodeSnapshotWriteSerializer(serializers.ModelSerializer):
    position = PositionField()
    radio_readings = RadioReadingWriteSerializer(many=True, required=False, default=list)

    class Meta:
        model = NodeSnapshot
        fields = ["node", "captured_at", "position", "radio_readings"]

    def validate_captured_at(self, value):
        now = timezone.now()
        max_age = datetime.timedelta(hours=settings.TELEMETRY_MAX_AGE_HOURS)
        future_tolerance = datetime.timedelta(minutes=settings.TELEMETRY_FUTURE_TOLERANCE_MINUTES)
        if value < now - max_age:
            raise serializers.ValidationError(
                f"captured_at is older than {settings.TELEMETRY_MAX_AGE_HOURS} hours",
                code="STALE_TIMESTAMP",
            )
        if value > now + future_tolerance:
            raise serializers.ValidationError(
                "captured_at is too far in the future",
                code="FUTURE_TIMESTAMP",
            )
        return value

    def create(self, validated_data):
        readings_data = validated_data.pop("radio_readings", [])
        snapshot = NodeSnapshot.objects.create(**validated_data)
        if readings_data:
            RadioReading.objects.bulk_create([RadioReading(snapshot=snapshot, **r) for r in readings_data])
        return snapshot
