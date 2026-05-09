from django.contrib import admin

from .models import Node, NodeAddress, NodeInterface, NodeRoute, NodeSnapshot, NodeWirelessNeighbour

# Register your models here.
admin.site.register(Node)
admin.site.register(NodeAddress)
admin.site.register(NodeInterface)
admin.site.register(NodeSnapshot)
admin.site.register(NodeRoute)
admin.site.register(NodeWirelessNeighbour)
