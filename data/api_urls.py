from django.urls import path
from rest_framework.routers import DefaultRouter

from . import api_views

router = DefaultRouter()
router.register("nodes", api_views.NodeViewSet, basename="node")
router.register("radios", api_views.RadioViewSet, basename="radio")
router.register("snapshots", api_views.NodeSnapshotViewSet, basename="snapshot")
router.register("readings", api_views.RadioReadingViewSet, basename="radioreading")

urlpatterns = router.urls + [
    path("telemetry/ingest/", api_views.TelemetryIngestView.as_view(), name="telemetry-ingest"),
]
