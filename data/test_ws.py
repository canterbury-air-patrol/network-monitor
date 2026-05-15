import pytest
from channels.layers import channel_layers, get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator

from .routing import websocket_urlpatterns


@pytest.fixture(autouse=True)
def in_memory_channel_layer(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    channel_layers.backends = {}
    yield
    channel_layers.backends = {}


@pytest.fixture
def ws_app():
    return URLRouter(websocket_urlpatterns)


async def test_connect_all_nodes(ws_app):
    communicator = WebsocketCommunicator(ws_app, "ws/nodes/")
    connected, _ = await communicator.connect()
    assert connected
    await communicator.disconnect()


async def test_connect_specific_node(ws_app):
    communicator = WebsocketCommunicator(ws_app, "ws/nodes/42/")
    connected, _ = await communicator.connect()
    assert connected
    await communicator.disconnect()


async def test_broadcast_to_nodes_group(ws_app):
    communicator = WebsocketCommunicator(ws_app, "ws/nodes/")
    connected, _ = await communicator.connect()
    assert connected

    payload = {"node_id": 1, "latitude": -43.5, "longitude": 172.5, "altitude": 100.0}
    await get_channel_layer().group_send("nodes", {"type": "node.snapshot", "data": payload})

    assert await communicator.receive_json_from() == payload
    await communicator.disconnect()


async def test_broadcast_to_node_group(ws_app):
    communicator = WebsocketCommunicator(ws_app, "ws/nodes/7/")
    connected, _ = await communicator.connect()
    assert connected

    payload = {"node_id": 7, "latitude": -43.5, "longitude": 172.5, "altitude": 200.0}
    await get_channel_layer().group_send("node.7", {"type": "node.snapshot", "data": payload})

    assert await communicator.receive_json_from() == payload
    await communicator.disconnect()


async def test_group_isolation(ws_app):
    comm_1 = WebsocketCommunicator(ws_app, "ws/nodes/1/")
    comm_2 = WebsocketCommunicator(ws_app, "ws/nodes/2/")
    assert (await comm_1.connect())[0]
    assert (await comm_2.connect())[0]

    await get_channel_layer().group_send("node.1", {"type": "node.snapshot", "data": {"node_id": 1}})

    assert await comm_1.receive_json_from() == {"node_id": 1}
    assert await comm_2.receive_nothing()

    await comm_1.disconnect()
    await comm_2.disconnect()
