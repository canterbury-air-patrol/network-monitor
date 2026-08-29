import pytest
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .factories import MissionFactory
from .models import MapDefaults, Mission


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def url():
    return reverse("data_api_v1:map-settings")


@pytest.mark.django_db
class TestMapDefaults:
    def test_falls_back_to_settings_without_a_row(self, api, url):
        with override_settings(MAP_DEFAULT_LATITUDE=-41.3, MAP_DEFAULT_LONGITUDE=174.8, MAP_DEFAULT_ZOOM=12):
            resp = api.get(url)
        assert resp.status_code == 200
        assert resp.data == {
            "center": {"latitude": -41.3, "longitude": 174.8},
            "zoom": 12,
            "source": "default",
            "mission": None,
        }

    def test_reading_the_view_does_not_create_a_row(self, api, url):
        api.get(url)
        assert not MapDefaults.objects.exists()

    def test_serves_the_configured_row(self, api, url):
        MapDefaults.objects.create(latitude=-36.85, longitude=174.76, zoom=14)
        resp = api.get(url)
        assert resp.data["center"] == {"latitude": -36.85, "longitude": 174.76}
        assert resp.data["zoom"] == 14
        assert resp.data["source"] == "default"

    def test_is_a_single_row(self):
        MapDefaults.objects.create(latitude=-36.85, longitude=174.76, zoom=14)
        MapDefaults.objects.create(latitude=-45.0, longitude=170.5, zoom=9)
        assert MapDefaults.objects.count() == 1
        assert MapDefaults.load().zoom == 9


@pytest.mark.django_db
class TestMissionOverride:
    def test_active_mission_overrides_centre_and_zoom(self, api, url):
        mission = MissionFactory(status=Mission.Status.ACTIVE, map_latitude=-45.03, map_longitude=168.66, map_zoom=13)
        resp = api.get(url)
        assert resp.data == {
            "center": {"latitude": -45.03, "longitude": 168.66},
            "zoom": 13,
            "source": "mission",
            "mission": mission.pk,
        }

    def test_zoom_only_override_keeps_the_default_centre(self, api, url):
        MapDefaults.objects.create(latitude=-36.85, longitude=174.76, zoom=14)
        MissionFactory(status=Mission.Status.ACTIVE, map_zoom=8)
        resp = api.get(url)
        assert resp.data["center"] == {"latitude": -36.85, "longitude": 174.76}
        assert resp.data["zoom"] == 8
        assert resp.data["source"] == "mission"

    def test_active_mission_without_an_override_leaves_the_default(self, api, url):
        MissionFactory(status=Mission.Status.ACTIVE)
        resp = api.get(url)
        assert resp.data["source"] == "default"
        assert resp.data["mission"] is None

    def test_inactive_mission_override_is_ignored(self, api, url):
        MissionFactory(status=Mission.Status.PENDING, map_latitude=-45.03, map_longitude=168.66)
        MissionFactory(status=Mission.Status.COMPLETED, map_latitude=-45.03, map_longitude=168.66)
        resp = api.get(url)
        assert resp.data["source"] == "default"

    def test_view_follows_the_mission_activated_most_recently(self, api, url):
        MissionFactory(status=Mission.Status.ACTIVE, map_latitude=-45.03, map_longitude=168.66)
        newest = MissionFactory(status=Mission.Status.ACTIVE, map_latitude=-41.3, map_longitude=174.8)
        resp = api.get(url)
        assert resp.data["mission"] == newest.pk

    def test_starting_a_mission_snaps_the_view_to_it(self, api, url):
        mission = MissionFactory(status=Mission.Status.PENDING, map_latitude=-45.03, map_longitude=168.66)
        assert api.get(url).data["source"] == "default"
        api.post(reverse("data_api_v1:mission-start", kwargs={"pk": mission.pk}))
        assert api.get(url).data["mission"] == mission.pk


@pytest.mark.django_db
class TestMissionOverrideAPI:
    def test_create_accepts_an_override(self, api):
        resp = api.post(
            reverse("data_api_v1:mission-list"),
            {"name": "Op Bravo", "map_latitude": -45.03, "map_longitude": 168.66, "map_zoom": 13},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["map_latitude"] == -45.03
        assert resp.data["map_zoom"] == 13

    def test_create_rejects_half_a_centre(self, api):
        resp = api.post(
            reverse("data_api_v1:mission-list"),
            {"name": "Op Bravo", "map_latitude": -45.03},
            format="json",
        )
        assert resp.status_code == 400

    def test_create_rejects_an_out_of_range_zoom(self, api):
        resp = api.post(
            reverse("data_api_v1:mission-list"),
            {"name": "Op Bravo", "map_zoom": 40},
            format="json",
        )
        assert resp.status_code == 400

    def test_database_rejects_half_a_centre(self):
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                MissionFactory(map_latitude=-45.03, map_longitude=None)
