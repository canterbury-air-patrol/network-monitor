from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Node, NodeSnapshot, Radio, RadioReading
from .serializers import (
    NodeSerializer,
    NodeSnapshotSerializer,
    NodeSnapshotWriteSerializer,
    RadioReadingSerializer,
    RadioSerializer,
)


class NodeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Node.objects.order_by("name")
    serializer_class = NodeSerializer


class RadioViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RadioSerializer

    def get_queryset(self):
        qs = Radio.objects.order_by("node", "radio_type")
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
        qs = RadioReading.objects.order_by("snapshot", "radio", "band")
        snapshot_id = self.request.query_params.get("snapshot")
        if snapshot_id:
            qs = qs.filter(snapshot_id=snapshot_id)
        radio_id = self.request.query_params.get("radio")
        if radio_id:
            qs = qs.filter(radio_id=radio_id)
        return qs


class TelemetryIngestView(APIView):
    def post(self, request):
        if not isinstance(request.data, list):
            return Response({"detail": "Expected a list of snapshots."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = NodeSnapshotWriteSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            snapshots = serializer.save()
        return Response({"created": len(snapshots)}, status=status.HTTP_201_CREATED)
