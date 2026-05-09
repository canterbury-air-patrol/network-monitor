from django.contrib.gis.db import models
from django.core.exceptions import ValidationError


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
        WIFI = 'wifi', 'WiFi'
        LORA = 'lora', 'LoRa'
        CELLULAR = 'cellular', 'Cellular'
        BLUETOOTH = 'bluetooth', 'Bluetooth'

    node = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='radios')
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
    timestamp = models.DateTimeField()
    position = models.PointField(dim=3, geography=True)

    GEOFIELD = "position"
    GEOJSON_FIELDS = (
        "node",
        "timestamp",
    )

    def __str__(self):
        return "{} status @ {}".format(self.node, self.timestamp)

    def natural_key(self):
        return self.timestamp


class NodeWirelessNeighbour(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE)
    interface = models.ForeignKey(NodeInterface, on_delete=models.CASCADE)
    neighbour_address = models.ForeignKey(NodeAddress, on_delete=models.CASCADE)
    signal_strength = models.IntegerField()

    def __str__(self):
        return "{} link to {} strength {}".format(self.snapshot.node, self.neighbour_address, self.signal_strength)


class NodeRoute(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE)
    route = models.CharField(max_length=60)
    next_hop = models.ForeignKey(NodeAddress, on_delete=models.CASCADE)

    def __str__(self):
        return "On {} route {} via {}".format(self.snapshot.node, self.route, self.next_hop)
