from django.contrib import admin

from .models import (
    GroundStation,
    MapDefaults,
    Mission,
    MissionPhase,
    Node,
    NodeAddress,
    NodeInterface,
    NodeRoute,
    NodeSnapshot,
    Radio,
    RadioReading,
)


@admin.register(MapDefaults)
class MapDefaultsAdmin(admin.ModelAdmin):
    """Single-row config: the add form is offered only while no row exists, and
    it opens pre-filled with the settings fallback the site is already using."""

    list_display = ("latitude", "longitude", "zoom")

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not MapDefaults.objects.exists()

    def get_changeform_initial_data(self, request):
        fallback = MapDefaults.load()
        return {
            "latitude": fallback.latitude,
            "longitude": fallback.longitude,
            "zoom": fallback.zoom,
        }


admin.site.register(Mission)
admin.site.register(MissionPhase)
admin.site.register(Node)
admin.site.register(NodeAddress)
admin.site.register(NodeInterface)
admin.site.register(NodeSnapshot)
admin.site.register(NodeRoute)
admin.site.register(Radio)
admin.site.register(GroundStation)
admin.site.register(RadioReading)
