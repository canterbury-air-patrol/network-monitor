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


def _walk_errors(node, out, index, path):
    if isinstance(node, list):
        if node and isinstance(node[0], dict):
            for i, child in enumerate(node):
                if child:
                    _walk_errors(child, out, index, f"{path}.{i}" if path else str(i))
        else:
            for msg in node:
                entry = {"field": path, "detail": str(msg)}
                if index is not None:
                    entry["index"] = index
                code = getattr(msg, "code", None)
                if code and code != "invalid":
                    entry["code"] = code
                out.append(entry)
    elif isinstance(node, dict):
        for key, child in node.items():
            _walk_errors(child, out, index, f"{path}.{key}" if path else key)


def _flatten_errors(errors):
    out = []
    if isinstance(errors, list):
        for idx, item in enumerate(errors):
            if item:
                _walk_errors(item, out, idx, "")
    else:
        _walk_errors(errors, out, None, "")
    return out


class TelemetryIngestView(APIView):
    def post(self, request):
        if not isinstance(request.data, list):
            return Response({"detail": "Expected a list of snapshots."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = NodeSnapshotWriteSerializer(data=request.data, many=True)
        if not serializer.is_valid():
            return Response({"errors": _flatten_errors(serializer.errors)}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            snapshots = serializer.save()
        return Response({"created": len(snapshots)}, status=status.HTTP_201_CREATED)
