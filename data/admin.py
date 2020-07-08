from django.contrib import admin

from .models import Node, NodeAddress, NodeInterface, NodeSnapshot

# Register your models here.
admin.site.register(Node)
admin.site.register(NodeAddress)
admin.site.register(NodeInterface)
admin.site.register(NodeSnapshot)
