from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/nodes/$", consumers.NodeStatusConsumer.as_asgi()),
    re_path(r"ws/nodes/(?P<node_id>\d+)/$", consumers.NodeStatusConsumer.as_asgi()),
]
