import contextvars
import logging

# Set by RequestIdMiddleware at the start of each request; reset on response.
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")


class RequestIdFilter(logging.Filter):
    """Injects the current request_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True
