# Phase 1: Backend API & WebSockets

## Infrastructure & Dependencies

- [ ] **[P1-01]** Pin the latest stable Django LTS and add core backend dependencies to `requirements.txt`: `djangorestframework`, `django-cors-headers`, `channels`, `daphne`.
- [ ] **[P1-02]** Update `settings.py` with `REST_FRAMEWORK` and `CORS_ALLOWED_ORIGINS` configuration.
- [ ] **[P1-03]** Configure `CHANNEL_LAYERS` in `settings.py`.
- [ ] **[P1-04]** Update `networkmonitor/asgi.py` to route HTTP and WebSocket traffic through Django Channels (the file exists as a bare stub and must be extended). *(Blocks: [P1-12])*
- [ ] **[P1-05]** Configure PostGIS-enabled test database in `settings.py` for `pytest`.

## API Versioning

- [ ] **[P1-20]** Prefix all API routes under `/api/v1/`. Document the versioning strategy: incompatible changes to the telemetry protocol or response schema require a new prefix; the device SDK declares the minimum API version it requires. Establish this before defining any endpoints. *(Blocks: [P1-10])*

## Data Model

> Complete [P1-06] and [P1-21]–[P1-23] before beginning API layer tasks [P1-07]–[P1-10].

- [ ] **[P1-06]** Update `NodeSnapshot` to store position as a 3D geometry field (`PointField(dim=3)`) capturing longitude, latitude, and altitude. Generate migration, inspect for destructive changes, apply, and verify it is reversible. *(Blocks: [P1-22])*
- [ ] **[P1-21]** Implement `Radio` model: FK to `Node`, radio type (WiFi, LoRa, etc.), list of supported band/frequency identifiers. One device has many radios. Generate and apply migration. *(Blocks: [P1-23])*
- [ ] **[P1-22]** Restructure `NodeSnapshot` as a position-only record: device FK, `captured_at` (device-reported datetime), `received_at` (server auto-set on arrival), 3D position. Remove any signal or neighbour fields that exist today — all signal data moves to `RadioReading`. Generate and apply migration. *(Requires: [P1-06]; Blocks: [P1-23], [P1-08], [P1-14], [P1-17])*
- [ ] **[P1-23]** Implement `RadioReading` model: FK to `NodeSnapshot`, FK to `Radio`, FK to `GroundStation`, `band` (frequency string, e.g. `"2.4GHz"`), `rssi_dbm`, `snr_db`. One snapshot produces many readings — one per (radio, band, visible ground station) combination. Generate and apply migration. *(Requires: [P1-21], [P1-22]; Blocks: [P1-07]–[P1-10], [P1-13]–[P1-15])*

## Async Task Queue

- [ ] **[P1-24]** Add `celery` and a Redis client to `requirements.txt`. Configure Celery to use the same Redis instance as the Channels layer (no new infrastructure service). Create `networkmonitor/celery.py` and add a `worker` service to Docker Compose that can run alongside the dev server. *(Referenced by: Phase 7, 8, 9, 10 for offloading expensive computations from the ASGI process)*

## Telemetry Ingest

- [ ] **[P1-17]** Extend the telemetry ingest endpoint to accept batched submissions — an array of snapshots each with their `RadioReading` records — so devices can flush their offline buffer after link recovery, preserving original `captured_at` timestamps. *(Requires: [P1-22], [P1-23]; Blocks: [P3-14], [P9-01], [P14-03])*
- [ ] **[P1-18]** Add validation on telemetry ingest: reject payloads with coordinates outside valid geographic bounds, implausible altitudes, RSSI values outside sensor range, unrecognised band identifiers, or `captured_at` exceeding a configurable staleness threshold. Return structured error codes the device SDK can interpret and log. *(Requires: [P1-17])*
- [ ] **[P1-19]** Add spatial and timestamp indexes to `NodeSnapshot` and a composite index on `RadioReading (snapshot_id, radio_id, band)`. Profile a time-range query across 10k snapshots and confirm latency is within an acceptable threshold before Phase 9 begins. *(Requires: [P1-22], [P1-23])*

## API Layer

- [ ] **[P1-07]** Create `data/serializers.py` with serializers for `Node` and `Radio`. *(Requires: [P1-21], [P1-23])*
- [ ] **[P1-08]** Add `NodeSnapshot` serializer nested to include all `RadioReading` records for that snapshot. *(Requires: [P1-22], [P1-23])*
- [ ] **[P1-09]** Add `RadioReading` serializer (replaces `NodeWirelessNeighbour`). *(Requires: [P1-23])*
- [ ] **[P1-10]** Implement DRF ViewSets in `data/api_views.py` for Nodes, Radios, Snapshots, and RadioReadings. *(Requires: [P1-07]–[P1-09], [P1-20])*
- [ ] **[P1-11]** Implement WebSocket consumers in `data/consumers.py`.
- [ ] **[P1-12]** Define WebSocket routing in `data/routing.py` and wire it into `networkmonitor/asgi.py`. *(Requires: [P1-04])*

## Tests

- [ ] **[P1-13]** Write unit tests for `Node` and `Radio` serializers using `factory-boy`. *(Requires: [P1-23])*
- [ ] **[P1-14]** Write unit tests for `NodeSnapshot` serializer; assert altitude survives serialization and all nested `RadioReading` records are present with correct band/RSSI values. *(Requires: [P1-22], [P1-23])*
- [ ] **[P1-15]** Write integration tests for Node, Snapshot, and RadioReading API endpoints. *(Requires: [P1-23])*
- [ ] **[P1-16]** Write tests for WebSocket message broadcasting and channel group isolation.
