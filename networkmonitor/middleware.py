import uuid

from networkmonitor.logging_filters import request_id_var


class RequestIdMiddleware:
    """Generates a UUID request ID, exposes it in the log context and response header."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = str(uuid.uuid4())
        token = request_id_var.set(request_id)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response["X-Request-Id"] = request_id
        return response
