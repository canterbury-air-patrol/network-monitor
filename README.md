# UAV Network Monitor

A modern, real-time dashboard for monitoring WiFi coverage and telemetry for UAV (Unmanned Aerial Vehicle) operations. This tool helps operators ensure mission safety by visualizing signal strength from ground-mounted antennas and predicting potential connectivity loss in the field.

## 🚀 Project Objective
Modernize a legacy network monitoring codebase into a high-performance, decoupled application capable of handling real-time telemetry from multiple UAVs and ground stations.

## 🛠 Architecture
- **Backend:** Django with Django REST Framework (DRF) for GIS-aware APIs.
- **Real-time:** Django Channels and WebSockets for instant telemetry updates.
- **Frontend:** React (TypeScript) + Vite + Tailwind CSS.
- **Mapping:** React-Leaflet with advanced heatmap and 3D visualization capabilities.
- **Environment:** Dockerized build system for consistent development and deployment.

## ✨ Key Features
- **Real-time Tracking:** Live GPS positioning and telemetry streaming.
- **Signal Coverage Heatmaps:** Visual identification of "dead zones" based on antenna propagation models and real-world observations.
- **Manual Pinning:** Deploy and manage ground-mounted antennas directly on the map.
- **"Likely to Lose Signal" Alerting:** Proactive trend analysis to warn pilots before signal drops below critical thresholds.
- **Mission Playback:** Post-mission debriefing with historical data replay and analysis.
- **3D Altitude Awareness:** (Phase 5) Visualization of UAV paths in 3D space to understand terrain and obstacle shadowing.

## 📋 Roadmap
The project is divided into structured phases:
1.  **Phase 1:** Backend API & WebSocket Overhaul
2.  **Phase 2:** Dockerized Frontend Setup
3.  **Phase 3:** UAV Features & Ground Stations
4.  **Phase 4:** Scaling (Organizations & Multiple Sites)
5.  **Phase 5-10:** Advanced Features (3D, Propagation Modeling, Playback, Alerts, and Audit Logging).

Detailed tasks are available in the [todo/](./todo/) directory.

## 🛡 Engineering Standards
This project adheres to strict engineering mandates defined in [AGENTS.md](./AGENTS.md). All contributors (AI or human) must follow the **Research -> Strategy -> Execution** lifecycle and maintain 100% test coverage for mission-critical logic.

## ⚙️ Development Setup
*Prerequisites: Docker, Python 3, Node/NPM.*

1.  **Initialize Environment:** `cp networkmonitor/local_settings.py.template networkmonitor/local_settings.py`
2.  **Start Services:** `docker-compose up -d`
3.  **Build Frontend:** `./build-frontend.sh`
4.  **Run Tests:** `docker-compose run --rm test` (Backend) | `./check-code.sh` (lint, types, unit tests) | `./run-e2e.sh` (Playwright E2E)

## 🛰 Flight Path Simulator
Generates a synthetic UAV flight — snapshots plus per radio/band/ground-station
`RadioReading` values — so the map, heatmap and coverage-gap tooling can be
exercised without hardware.

```bash
# Fast-forward the bundled demo flight straight into the database
docker compose exec app ./manage.py simulate_flight --demo

# Feed a running dev server through the ingest API, at wall-clock pace
docker compose exec app ./manage.py simulate_flight \
    --scenario data/scenarios/demo_flight.json --transport http --realtime

# Emit ingest payloads as JSON lines for an external harness
docker compose exec app ./manage.py simulate_flight --demo --transport stdout
```

Scenarios are JSON documents (see [`data/scenarios/demo_flight.json`](./data/scenarios/demo_flight.json))
describing the ground stations, the UAV's radios and bands, the waypoint path,
and the link model. `links` entries override the log-distance path-loss
parameters — or pin an exact `rssi_dbm` — for any combination of radio type,
band and ground station, and `dropouts` take a station off the air for a window
of the flight, which is how coverage gaps are staged. Runs are reproducible via
`seed`; missing `Node`, `Radio` and `GroundStation` rows are created on the fly
unless `--no-bootstrap` is given.

## 🧪 WebSocket Stress Test
Opens concurrent WebSocket connections (50 by default) against the real ASGI
application and broadcasts telemetry through the configured channel layer,
reporting end-to-end latency and drop rate — the numbers that decide how many
operators a deployment can carry before the map starts skipping updates.

```bash
# Default sweep: 50 clients on the global broadcast group
docker compose exec app ./manage.py stress_websockets

# Fan out over per-node groups, 200 clients, machine-readable output
docker compose exec app ./manage.py stress_websockets \
    --clients 200 --nodes 20 --messages 500 --rate 50 --json

# Use as a gate: non-zero exit if the layer regresses
docker compose exec app ./manage.py stress_websockets --max-drop-rate 0 --max-p95-ms 250
```

The connections are driven in-process, so routing, origin validation and
`NodeStatusConsumer` all run as they do in production while the timings stay
free of TCP and HTTP framing noise: what is being measured is the channel
layer, and with `channels_redis` every broadcast makes a real Redis round trip.
Messages are counted per client, so a broadcast a saturated channel silently
discards — `channels_redis` drops for any channel over its capacity — shows up
as a drop rate rather than as an unexplained gap on the map. `--rate 0`
publishes flat out, which is how the layer's ceiling is found; `--grace` sets
how long a quiet tail must be before undelivered messages are written off.

## 🖼 End-to-End & Visual Regression Tests
The Playwright suite drives the built UI against a stubbed backend and a mocked
telemetry socket, so it needs no running services. `run-e2e.sh` executes it in
the `mcr.microsoft.com/playwright` image matching the pinned `@playwright/test`
version — the frontend's own Node image ships no browsers:

```bash
./run-e2e.sh                                   # the whole suite
./run-e2e.sh --project=visual                  # visual regression only
./run-e2e.sh uav-markers.spec.ts               # one spec
./run-e2e.sh --project=visual --update-snapshots   # re-take the baselines
```

The `visual` project photographs the screen states an operator works from —
the loaded map, the coverage heatmap, live and lost UAV markers, the station
form and roster, the signal history panel, the imperial unit selection and the
degraded-overlay and crashed-panel notices — and compares them against
baselines committed in [`frontend/e2e/__screenshots__/`](./frontend/e2e/__screenshots__).
A screenshot only reproduces in the environment that rendered it, so these
tests run **only** inside that pinned image, which is what sets
`PLAYWRIGHT_VISUAL=1`; anywhere else they skip with a note rather than
reporting failures about the host's fonts. CI runs the same image, and a
Playwright upgrade fails the job until the workflow's container tag is moved
and the baselines re-taken.

When a baseline fails, the report and the actual/diff images are uploaded as
the `playwright-report` artifact. Review the diff: if the change is intended,
re-take the baselines with the command above and commit the new images with
the change that caused them.

## 📡 Stale Node Display
A node that stops reporting is shown on the map by how long it has been
silent, measured on the device's `captured_at` timestamps so a buffered
device flushing old snapshots after link recovery does not read as healthy:

- **Live** — reporting steadily; keeps the standard UAV marker.
- **Link degraded** — silent past the degraded timeout, or still delivering
  but with gaps that long; amber warning marker with a permanent
  "last seen X ago" label.
- **Contact lost** — nothing at all inside the lost timeout; greyed warning
  marker with the same label.

The thresholds default to 30 s and 120 s and are set at frontend build time
for deployments flying slower reporting intervals:

```bash
VITE_LINK_DEGRADED_AFTER_S=60 VITE_LINK_LOST_AFTER_S=300 ./build-frontend.sh
```

---
*Maintained for mission-critical flight monitoring reliability.*
