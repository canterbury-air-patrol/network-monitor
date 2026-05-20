import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from .factories import MissionFactory, MissionPhaseFactory
from .models import Mission, MissionPhase


@pytest.fixture
def api():
    return APIClient()


@pytest.mark.django_db
class TestMissionLifecycleAPI:
    def test_create_defaults_to_pending(self, api):
        url = reverse("data_api_v1:mission-list")
        resp = api.post(url, {"name": "Op Alpha", "operator_notes": "notes"}, format="json")
        assert resp.status_code == 201
        assert resp.data["status"] == "pending"
        assert resp.data["name"] == "Op Alpha"

    def test_list_missions(self, api):
        MissionFactory.create_batch(3)
        resp = api.get(reverse("data_api_v1:mission-list"))
        assert resp.status_code == 200
        assert resp.data["count"] == 3

    def test_start_pending_mission(self, api):
        mission = MissionFactory(status=Mission.Status.PENDING)
        resp = api.post(reverse("data_api_v1:mission-start", kwargs={"pk": mission.pk}))
        assert resp.status_code == 200
        assert resp.data["status"] == "active"

    def test_cannot_start_active_mission(self, api):
        mission = MissionFactory(status=Mission.Status.ACTIVE)
        resp = api.post(reverse("data_api_v1:mission-start", kwargs={"pk": mission.pk}))
        assert resp.status_code == 400

    def test_stop_active_mission(self, api):
        mission = MissionFactory(status=Mission.Status.ACTIVE)
        resp = api.post(reverse("data_api_v1:mission-stop", kwargs={"pk": mission.pk}))
        assert resp.status_code == 200
        assert resp.data["status"] == "completed"

    def test_cannot_stop_pending_mission(self, api):
        mission = MissionFactory(status=Mission.Status.PENDING)
        resp = api.post(reverse("data_api_v1:mission-stop", kwargs={"pk": mission.pk}))
        assert resp.status_code == 400

    def test_archive_completed_mission(self, api):
        mission = MissionFactory(status=Mission.Status.COMPLETED)
        resp = api.post(reverse("data_api_v1:mission-archive", kwargs={"pk": mission.pk}))
        assert resp.status_code == 200
        assert resp.data["status"] == "archived"

    def test_archive_pending_mission(self, api):
        mission = MissionFactory(status=Mission.Status.PENDING)
        resp = api.post(reverse("data_api_v1:mission-archive", kwargs={"pk": mission.pk}))
        assert resp.status_code == 200
        assert resp.data["status"] == "archived"

    def test_cannot_archive_active_mission(self, api):
        mission = MissionFactory(status=Mission.Status.ACTIVE)
        resp = api.post(reverse("data_api_v1:mission-archive", kwargs={"pk": mission.pk}))
        assert resp.status_code == 400


@pytest.mark.django_db
class TestMissionPhaseAPI:
    def test_create_phase(self, api):
        mission = MissionFactory()
        resp = api.post(
            reverse("data_api_v1:missionphase-list"),
            {"mission": mission.pk, "name": "Sweep North"},
            format="json",
        )
        assert resp.status_code == 201
        assert resp.data["is_active"] is False
        assert resp.data["started_at"] is None

    def test_activate_phase(self, api):
        phase = MissionPhaseFactory()
        resp = api.post(reverse("data_api_v1:missionphase-activate", kwargs={"pk": phase.pk}))
        assert resp.status_code == 200
        assert resp.data["is_active"] is True
        assert resp.data["started_at"] is not None

    def test_activate_closes_current_active_phase(self, api):
        mission = MissionFactory(status=Mission.Status.ACTIVE)
        phase_a = MissionPhaseFactory(mission=mission, started_at=timezone.now())
        phase_b = MissionPhaseFactory(mission=mission)

        api.post(reverse("data_api_v1:missionphase-activate", kwargs={"pk": phase_b.pk}))

        phase_a.refresh_from_db()
        assert phase_a.ended_at is not None

    def test_cannot_reactivate_closed_phase(self, api):
        now = timezone.now()
        phase = MissionPhaseFactory(started_at=now, ended_at=now)
        resp = api.post(reverse("data_api_v1:missionphase-activate", kwargs={"pk": phase.pk}))
        assert resp.status_code == 400

    def test_close_active_phase(self, api):
        phase = MissionPhaseFactory(started_at=timezone.now())
        resp = api.post(reverse("data_api_v1:missionphase-close", kwargs={"pk": phase.pk}))
        assert resp.status_code == 200
        assert resp.data["is_active"] is False
        assert resp.data["ended_at"] is not None

    def test_cannot_close_inactive_phase(self, api):
        phase = MissionPhaseFactory()  # never started
        resp = api.post(reverse("data_api_v1:missionphase-close", kwargs={"pk": phase.pk}))
        assert resp.status_code == 400

    def test_filter_phases_by_mission(self, api):
        m1 = MissionFactory()
        m2 = MissionFactory()
        MissionPhaseFactory.create_batch(2, mission=m1)
        MissionPhaseFactory(mission=m2)

        resp = api.get(reverse("data_api_v1:missionphase-list"), {"mission": m1.pk})
        assert resp.status_code == 200
        assert resp.data["count"] == 2

    def test_filter_phases_by_mission_bad_id(self, api):
        resp = api.get(reverse("data_api_v1:missionphase-list"), {"mission": "not-an-int"})
        assert resp.status_code == 400

    def test_cannot_activate_phase_for_completed_mission(self, api):
        phase = MissionPhaseFactory(mission=MissionFactory(status=Mission.Status.COMPLETED))
        resp = api.post(reverse("data_api_v1:missionphase-activate", kwargs={"pk": phase.pk}))
        assert resp.status_code == 400

    def test_cannot_activate_phase_for_archived_mission(self, api):
        phase = MissionPhaseFactory(mission=MissionFactory(status=Mission.Status.ARCHIVED))
        resp = api.post(reverse("data_api_v1:missionphase-activate", kwargs={"pk": phase.pk}))
        assert resp.status_code == 400

    def test_cannot_close_phase_for_completed_mission(self, api):
        phase = MissionPhaseFactory(
            mission=MissionFactory(status=Mission.Status.COMPLETED),
            started_at=timezone.now(),
        )
        resp = api.post(reverse("data_api_v1:missionphase-close", kwargs={"pk": phase.pk}))
        assert resp.status_code == 400


@pytest.mark.django_db
def test_full_mission_lifecycle(api):
    """create → start → phases → switch → stop → archive"""
    # create
    resp = api.post(reverse("data_api_v1:mission-list"), {"name": "Field Op Alpha"}, format="json")
    assert resp.status_code == 201
    mid = resp.data["id"]

    # start
    resp = api.post(reverse("data_api_v1:mission-start", kwargs={"pk": mid}))
    assert resp.data["status"] == "active"

    # create two phases
    phase_url = reverse("data_api_v1:missionphase-list")
    resp = api.post(phase_url, {"mission": mid, "name": "Phase A"}, format="json")
    assert resp.status_code == 201
    pid_a = resp.data["id"]

    resp = api.post(phase_url, {"mission": mid, "name": "Phase B"}, format="json")
    assert resp.status_code == 201
    pid_b = resp.data["id"]

    # activate A
    resp = api.post(reverse("data_api_v1:missionphase-activate", kwargs={"pk": pid_a}))
    assert resp.data["is_active"] is True

    # switch to B — A must be auto-closed
    resp = api.post(reverse("data_api_v1:missionphase-activate", kwargs={"pk": pid_b}))
    assert resp.data["is_active"] is True
    assert MissionPhase.objects.get(pk=pid_a).ended_at is not None

    # close B explicitly
    resp = api.post(reverse("data_api_v1:missionphase-close", kwargs={"pk": pid_b}))
    assert resp.data["is_active"] is False

    # stop mission
    resp = api.post(reverse("data_api_v1:mission-stop", kwargs={"pk": mid}))
    assert resp.data["status"] == "completed"

    # archive
    resp = api.post(reverse("data_api_v1:mission-archive", kwargs={"pk": mid}))
    assert resp.data["status"] == "archived"
