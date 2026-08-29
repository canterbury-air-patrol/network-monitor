from django.conf import settings
from django.contrib.gis.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db.models import F, Q

# Leaflet's tile zoom scale; 22 is the deepest level any tile source offers.
MAP_MIN_ZOOM = 0
MAP_MAX_ZOOM = 22


def _latitude_validators():
    return [MinValueValidator(-90.0), MaxValueValidator(90.0)]


def _longitude_validators():
    return [MinValueValidator(-180.0), MaxValueValidator(180.0)]


def _zoom_validators():
    return [MinValueValidator(MAP_MIN_ZOOM), MaxValueValidator(MAP_MAX_ZOOM)]


class Node(models.Model):
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

    def natural_key(self):
        return self.name


class NodeAddress(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    address = models.CharField(max_length=50)

    class Layer(models.IntegerChoices):
        L2 = 2
        L3 = 3

    address_layer = models.IntegerField(choices=Layer.choices)

    def __str__(self):
        return "{} on {}".format(self.address, self.node)

    def natural_key(self):
        return self.address


class NodeInterface(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    ifname = models.CharField(max_length=20)

    def __str__(self):
        return "{} on {}".format(self.ifname, self.node)

    def natural_key(self):
        return self.__str__()


class Radio(models.Model):
    class RadioType(models.TextChoices):
        WIFI = "wifi", "WiFi"
        LORA = "lora", "LoRa"
        CELLULAR = "cellular", "Cellular"
        BLUETOOTH = "bluetooth", "Bluetooth"

    node = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="radios")
    radio_type = models.CharField(max_length=20, choices=RadioType.choices)
    bands = models.JSONField(default=list, help_text='Supported band/frequency identifiers, e.g. ["2.4GHz", "5GHz"]')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["node", "radio_type"], name="uniq_radio_node_radio_type"),
        ]

    def clean(self):
        super().clean()
        if self.bands is None:
            self.bands = []
        if not isinstance(self.bands, list):
            raise ValidationError({"bands": "Bands must be a list of string identifiers."})
        normalized = []
        for value in self.bands:
            if not isinstance(value, str):
                raise ValidationError({"bands": "Each band must be a string identifier."})
            stripped = value.strip()
            if not stripped:
                raise ValidationError({"bands": "Band identifiers cannot be empty strings."})
            normalized.append(stripped)
        self.bands = normalized

    def __str__(self):
        return "{} {} radio".format(self.node, self.get_radio_type_display())

    def natural_key(self):
        # Node.natural_key() returns a plain string, so this is already a flat
        # 2-tuple ("node_name", "wifi") — no further unpacking needed.
        return (self.node.natural_key(), self.radio_type)


class NodeSnapshot(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    captured_at = models.DateTimeField(help_text="Device-reported capture timestamp")
    received_at = models.DateTimeField(auto_now_add=True, help_text="Server arrival timestamp")
    position = models.PointField(dim=3, geography=True)

    GEOFIELD = "position"
    GEOJSON_FIELDS = ("node", "captured_at")

    class Meta:
        indexes = [
            models.Index(fields=["captured_at"]),
            models.Index(fields=["received_at"]),
        ]

    def __str__(self):
        return "{} status @ {}".format(self.node, self.captured_at)

    def natural_key(self):
        return self.captured_at


class GroundStation(models.Model):
    name = models.CharField(max_length=255, unique=True)
    # geography=True gives WGS84 spheroid distance calculations but PostGIS geography
    # functions generally ignore the Z coordinate. Revisit when RF propagation
    # calculations (Phase 7/8) require accurate 3D distances.
    position = models.PointField(dim=3, geography=True)

    def __str__(self):
        return self.name

    def natural_key(self):
        return self.name


class RadioReading(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE, related_name="radio_readings")
    radio = models.ForeignKey(Radio, on_delete=models.CASCADE, related_name="readings")
    ground_station = models.ForeignKey(
        GroundStation, on_delete=models.SET_NULL, null=True, blank=True, related_name="readings"
    )
    relay_node = models.ForeignKey(
        Node,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="relay_readings",
        help_text="Node acting as receiver: relay UAV extending coverage, or search node temporarily filling a gap",
    )
    band = models.CharField(max_length=20, help_text='Frequency band identifier, e.g. "2.4GHz"')
    rssi_dbm = models.IntegerField(help_text="Received signal strength in dBm")
    snr_db = models.FloatField(null=True, blank=True, help_text="Signal-to-noise ratio in dB")

    class Meta:
        constraints = [
            # Exactly one receiver required per reading.
            models.CheckConstraint(
                condition=(
                    (Q(ground_station__isnull=False) & Q(relay_node__isnull=True))
                    | (Q(ground_station__isnull=True) & Q(relay_node__isnull=False))
                ),
                name="radioreading_exactly_one_receiver",
            ),
        ]
        indexes = [
            models.Index(fields=["snapshot", "radio", "band"]),
        ]

    def __str__(self):
        receiver = self.ground_station or self.relay_node or "unknown"
        return "{} {} {} → {} {} dBm".format(self.snapshot, self.radio, self.band, receiver, self.rssi_dbm)


class NodeRoute(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE)
    route = models.CharField(max_length=60)
    next_hop = models.ForeignKey(NodeAddress, on_delete=models.CASCADE)

    def __str__(self):
        return "On {} route {} via {}".format(self.snapshot.node, self.route, self.next_hop)


class Mission(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=255)
    operator_notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Optional viewport override so the map snaps to this mission's area of
    # operation when it goes active. Left null, the deployment default applies.
    map_latitude = models.FloatField(null=True, blank=True, validators=_latitude_validators())
    map_longitude = models.FloatField(null=True, blank=True, validators=_longitude_validators())
    map_zoom = models.PositiveSmallIntegerField(null=True, blank=True, validators=_zoom_validators())
    # site FK added in Phase 5 (Org/Site multi-tenancy)

    class Meta:
        constraints = [
            # Half a centre is not a centre; zoom is overridable on its own.
            models.CheckConstraint(
                name="mission_map_centre_both_or_neither",
                condition=Q(map_latitude__isnull=True, map_longitude__isnull=True)
                | Q(map_latitude__isnull=False, map_longitude__isnull=False),
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"


class MissionPhase(models.Model):
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name="phases")
    name = models.CharField(max_length=255)
    area_of_operation_notes = models.TextField(blank=True)
    ground_station_layout = models.TextField(blank=True)
    # Phase boundaries are timestamp windows: snapshots whose captured_at falls
    # between started_at and ended_at belong to this phase. This keeps ingest
    # writes cheap (no FK to update on every snapshot).
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["started_at", "id"]
        constraints = [
            models.CheckConstraint(
                name="missionphase_ended_requires_started",
                condition=Q(ended_at__isnull=True) | Q(started_at__isnull=False),
            ),
            models.CheckConstraint(
                name="missionphase_started_at_lte_ended_at",
                condition=Q(ended_at__isnull=True) | Q(started_at__lte=F("ended_at")),
            ),
        ]
        indexes = [
            models.Index(fields=["mission", "started_at", "ended_at"]),
        ]

    @property
    def is_active(self):
        # started_at is always set to timezone.now() by the activate action,
        # so a future started_at cannot arise through the API. Phases with a
        # null started_at have not been activated yet and are not active.
        return self.started_at is not None and self.ended_at is None

    def __str__(self):
        return f"{self.mission} — {self.name}"


class MapDefaults(models.Model):
    """Deployment-wide default map viewport, edited in the Django admin.

    One deployment, one default view: the row is pinned to pk=1. Per-site
    configuration arrives with Phase 5 multi-tenancy; until then a single row
    suffices, and an install with no row at all falls back to the
    ``MAP_DEFAULT_*`` settings.
    """

    latitude = models.FloatField(validators=_latitude_validators())
    longitude = models.FloatField(validators=_longitude_validators())
    zoom = models.PositiveSmallIntegerField(validators=_zoom_validators())

    class Meta:
        verbose_name = "map defaults"
        verbose_name_plural = "map defaults"

    def save(self, *args, **kwargs):
        # Every write lands on the same row, whichever way it was created:
        # saving a second instance updates the default rather than failing on
        # the primary key.
        self.pk = 1
        kwargs["force_insert"] = False
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Map defaults ({self.latitude}, {self.longitude}) @ z{self.zoom}"

    @classmethod
    def load(cls):
        """The configured defaults, or an unsaved instance of the settings
        fallback. Reading the viewport must never write to the database."""
        row = cls.objects.filter(pk=1).first()
        if row is not None:
            return row
        return cls(
            pk=1,
            latitude=settings.MAP_DEFAULT_LATITUDE,
            longitude=settings.MAP_DEFAULT_LONGITUDE,
            zoom=settings.MAP_DEFAULT_ZOOM,
        )


def resolve_map_view():
    """The viewport a client should open on: the active mission's override, if
    it has one, layered field-by-field over the deployment default.

    A mission may override the centre, the zoom, or both, so a mission that
    only names its area of operation keeps the deployment's zoom.
    """
    defaults = MapDefaults.load()
    latitude, longitude, zoom = defaults.latitude, defaults.longitude, defaults.zoom

    mission = (
        Mission.objects.filter(status=Mission.Status.ACTIVE)
        .filter(Q(map_latitude__isnull=False) | Q(map_zoom__isnull=False))
        .order_by("-updated_at", "-id")
        .first()
    )
    if mission is not None:
        if mission.map_latitude is not None:
            latitude, longitude = mission.map_latitude, mission.map_longitude
        if mission.map_zoom is not None:
            zoom = mission.map_zoom

    return {
        "center": {"latitude": latitude, "longitude": longitude},
        "zoom": zoom,
        "source": "mission" if mission is not None else "default",
        "mission": mission.pk if mission is not None else None,
    }
