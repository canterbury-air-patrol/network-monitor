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
4.  **Run Tests:** `docker-compose run --rm test` (Backend) | `./build-frontend.sh` (Frontend)

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
