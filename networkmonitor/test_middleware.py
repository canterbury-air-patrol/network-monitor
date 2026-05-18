import pytest
from django.test import Client
from django.urls import reverse


@pytest.mark.django_db
def test_request_id_header_present():
    client = Client()
    response = client.get(reverse("health"))
    assert "X-Request-Id" in response
    assert len(response["X-Request-Id"]) == 36  # UUID4 string length


@pytest.mark.django_db
def test_request_id_unique_per_request():
    client = Client()
    r1 = client.get(reverse("health"))
    r2 = client.get(reverse("health"))
    assert r1["X-Request-Id"] != r2["X-Request-Id"]


@pytest.mark.django_db
def test_request_id_in_drf_error_body():
    client = Client()
    # POST to the health endpoint is not allowed — DRF returns a 405 error body.
    response = client.post(reverse("health"), content_type="application/json")
    assert response.status_code == 405
    data = response.json()
    assert "request_id" in data
    assert len(data["request_id"]) == 36
