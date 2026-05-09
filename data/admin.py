from django.contrib import admin

from .models import GroundStation, Node, NodeAddress, NodeInterface, NodeRoute, NodeSnapshot, Radio, RadioReading

admin.site.register(Node)
admin.site.register(NodeAddress)
admin.site.register(NodeInterface)
admin.site.register(NodeSnapshot)
admin.site.register(NodeRoute)
admin.site.register(Radio)
admin.site.register(GroundStation)
admin.site.register(RadioReading)
