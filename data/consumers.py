from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NodeStatusConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        node_id = self.scope["url_route"]["kwargs"].get("node_id")
        self.group_name = f"node.{node_id}" if node_id else "nodes"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def node_snapshot(self, event):
        await self.send_json(event["data"])
