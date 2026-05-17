import pytest


def test_celery_app_importable():
    from networkmonitor.celery import app

    assert app.main == "networkmonitor"


def test_celery_broker_uses_redis():
    from networkmonitor.celery import app

    assert app.conf.broker_url.startswith("redis://")


def test_celery_result_backend_uses_redis():
    from networkmonitor.celery import app

    assert app.conf.result_backend.startswith("redis://")


def test_celery_uses_json_serializer():
    from networkmonitor.celery import app

    assert app.conf.task_serializer == "json"
    assert "json" in app.conf.accept_content


@pytest.mark.django_db
def test_celery_app_loaded_via_django_init():
    import networkmonitor

    assert hasattr(networkmonitor, "celery_app")
