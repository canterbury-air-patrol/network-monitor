from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import connection
from rest_framework import status as drf_status
from rest_framework.response import Response
from rest_framework.views import APIView


def _check_database():
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")


def _check_channels():
    layer = get_channel_layer()
    if layer is None:
        raise RuntimeError("no channel layer configured")
    async_to_sync(layer.send)("_health_probe", {"type": "health.check"})


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        checks = {}
        all_ok = True

        try:
            _check_database()
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "error"
            all_ok = False

        try:
            _check_channels()
            checks["channels"] = "ok"
        except Exception:
            checks["channels"] = "error"
            all_ok = False

        checks["status"] = "ok" if all_ok else "error"
        http_status = drf_status.HTTP_200_OK if all_ok else drf_status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(checks, status=http_status)
