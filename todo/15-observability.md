# Phase 15: Observability (Minimum Viable)

> **Requires:** Phase 1 complete.
>
> This phase establishes the minimum instrumentation needed to operate the service in production. Prometheus metrics, distributed tracing, and custom dashboards are explicitly deferred to a future phase — do not add them here.

- [ ] **[P15-01]** Implement `GET /api/health/` endpoint: checks PostgreSQL connectivity and Channels layer availability, returns `200 OK` with a JSON status summary, or `503` with a structured error body if any dependency is down. *(Referenced by: [P16-06])*
- [ ] **[P15-02]** Configure structured JSON logging: every log entry includes `timestamp`, `level`, `request_id`, `message`, and relevant context fields. Replace Django's default text formatter project-wide.
- [ ] **[P15-03]** Add request ID middleware: generate a UUID per request, attach it to the log context for the lifetime of the request, and include it in error response bodies so operators can correlate a client-reported error to a server log line.
- [ ] **[P15-04]** Integrate an error tracker (Sentry SDK or self-hosted Glitchtip): capture unhandled exceptions in the ASGI layer and log warnings for recoverable errors (e.g. malformed telemetry). Configure the DSN from an environment variable — no credentials in source. *(Requires: [P15-03])*
- [ ] **[P15-05]** Write tests for the health endpoint under three conditions: all healthy, PostgreSQL unavailable (mocked), and Channels layer unavailable (mocked). Assert both the HTTP status code and the JSON response structure in each case. *(Requires: [P15-01])*
