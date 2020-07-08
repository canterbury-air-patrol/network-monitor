from django.contrib.gis.db import models


class Node(models.Model):
    name = models.CharField(max_length=255)


class NodeAddress(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    address = models.CharField(max_length=50)
    class Layer(models.IntegerChoices):
        L2 = 2
        L3 = 3
    address_layer = models.IntegerField(choices=Layer.choices)


class NodeInterface(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    ifname = models.CharField(max_length=20)


class NodeSnapshot(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    timestamp = models.DateTimeField()
    position = models.PointField(geography=True)


class NodeWirelessNeighbour(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE)
    interface = models.ForeignKey(NodeInterface, on_delete=models.CASCADE)
    neighbour_address = models.ForeignKey(NodeAddress, on_delete=models.CASCADE)
    signal_strength = models.IntegerField()


class NodeRoute(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE)
    route = models.CharField(max_length=60)
    next_hop = models.ForeignKey(NodeAddress, on_delete=models.CASCADE)
