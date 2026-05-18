from rest_framework.views import exception_handler as drf_exception_handler

from networkmonitor.logging_filters import request_id_var


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        request_id = request_id_var.get()
        if request_id and isinstance(response.data, dict):
            response.data["request_id"] = request_id
    return response
