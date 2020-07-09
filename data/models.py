from django.contrib.gis.db import models


class Node(models.Model):
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name


class NodeAddress(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    address = models.CharField(max_length=50)
    class Layer(models.IntegerChoices):
        L2 = 2
        L3 = 3
    address_layer = models.IntegerField(choices=Layer.choices)

    def __str__(self):
        return '{} on {}'.format(self.address, self.node)


class NodeInterface(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    ifname = models.CharField(max_length=20)

    def __str__(self):
        return '{} on {}'.format(self.ifname, self.node)


class NodeSnapshot(models.Model):
    node = models.ForeignKey(Node, on_delete=models.CASCADE)
    timestamp = models.DateTimeField()
    position = models.PointField(geography=True)

    def __str__(self):
        return '{} status @ {}'.format(self.node, self.timestamp)


class NodeWirelessNeighbour(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE)
    interface = models.ForeignKey(NodeInterface, on_delete=models.CASCADE)
    neighbour_address = models.ForeignKey(NodeAddress, on_delete=models.CASCADE)
    signal_strength = models.IntegerField()

    def __str__(self):
        return '{} link to {} strength {}'.format(self.snapshot.node, self.neighbour_address, self.signal_strength)


class NodeRoute(models.Model):
    snapshot = models.ForeignKey(NodeSnapshot, on_delete=models.CASCADE)
    route = models.CharField(max_length=60)
    next_hop = models.ForeignKey(NodeAddress, on_delete=models.CASCADE)

    def __str__(self):
        return 'On {} route {} via {}'.format(self.snapshot.node, self.route, self.next_hop)