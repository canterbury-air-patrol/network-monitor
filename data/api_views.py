from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Mission, Node, NodeSnapshot, Radio, RadioReading
from .serializers import (
    MissionSerializer,
    NodeSerializer,
    NodeSnapshotSerializer,
    NodeSnapshotWriteSerializer,
    RadioReadingSerializer,
    RadioSerializer,
)


class MissionViewSet(viewsets.ModelViewSet):
    queryset = Mission.objects.order_by("-created_at")
    serializer_class = MissionSerializer
    http_method_names = ["get", "post", "head", "options"]

    def perform_create(self, serializer):
        serializer.save(status=Mission.Status.PENDING)

    def _transition(self, from_statuses, to_status, error_msg):
        with transaction.atomic():
            mission = self.get_object()
            mission = Mission.objects.select_for_update().get(pk=mission.pk)
            if mission.status not in from_statuses:
                raise ValidationError({"detail": error_msg})
            mission.status = to_status
            mission.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(mission).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        return self._transition(
            from_statuses=[Mission.Status.PENDING],
            to_status=Mission.Status.ACTIVE,
            error_msg="Only pending missions can be started.",
        )

    @action(detail=True, methods=["post"])
    def stop(self, request, pk=None):
        return self._transition(
            from_statuses=[Mission.Status.ACTIVE],
            to_status=Mission.Status.COMPLETED,
            error_msg="Only active missions can be stopped.",
        )

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._transition(
            from_statuses=[Mission.Status.PENDING, Mission.Status.COMPLETED],
            to_status=Mission.Status.ARCHIVED,
            error_msg="Only pending or completed missions can be archived.",
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
