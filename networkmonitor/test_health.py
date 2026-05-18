from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from django.test import Client
from django.urls import reverse


@pytest.mark.django_db
def test_health_all_ok():
    client = Client()
    response = client.get(reverse("health"))
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"
    assert data["channels"] == "ok"


@pytest.mark.django_db
def test_health_database_unavailable():
    client = Client()
    with patch("networkmonitor.views._check_database", side_effect=Exception("DB down")):
        response = client.get(reverse("health"))
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "error"
    assert data["database"] == "error"
    assert data["channels"] == "ok"


@pytest.mark.django_db
def test_health_channels_unavailable():
    client = Client()
    mock_layer = MagicMock()
    mock_layer.send = AsyncMock(side_effect=Exception("Redis down"))
    with patch("networkmonitor.views.get_channel_layer", return_value=mock_layer):
        response = client.get(reverse("health"))
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "error"
    assert data["database"] == "ok"
    assert data["channels"] == "error"
