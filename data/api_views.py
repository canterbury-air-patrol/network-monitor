from rest_framework import viewsets

from .models import Node, NodeSnapshot, Radio, RadioReading
from .serializers import NodeSerializer, NodeSnapshotSerializer, RadioReadingSerializer, RadioSerializer


class NodeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Node.objects.all()
    serializer_class = NodeSerializer


class RadioViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RadioSerializer

    def get_queryset(self):
        qs = Radio.objects.all()
        node_id = self.request.query_params.get("node")
        if node_id:
            qs = qs.filter(node_id=node_id)
        return qs


class NodeSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NodeSnapshotSerializer

    def get_queryset(self):
        qs = NodeSnapshot.objects.prefetch_related("radio_readings").order_by("-captured_at")
        node_id = self.request.query_params.get("node")
        if node_id:
            qs = qs.filter(node_id=node_id)
        return qs


class RadioReadingViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RadioReadingSerializer

    def get_queryset(self):
        qs = RadioReading.objects.all()
        snapshot_id = self.request.query_params.get("snapshot")
        if snapshot_id:
            qs = qs.filter(snapshot_id=snapshot_id)
        radio_id = self.request.query_params.get("radio")
        if radio_id:
            qs = qs.filter(radio_id=radio_id)
        return qs
