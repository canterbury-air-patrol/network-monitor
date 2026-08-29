# Phase 3: UAV Features & Ground Stations

> **Requires:** Phase 2 complete.

## Map & Real-time Display

> **Display priority:** RF coverage over the mission area is the primary display. UAV position is tracked by two external systems and is a secondary overlay. The coverage gap layer (Phase 10) should be on by default; UAV markers are optional and off by default. Design the map component with this hierarchy from the start.

- [x] **[P3-01]** Implement Map component with a coverage heatmap as the primary layer and real-time UAV position markers as a toggleable secondary overlay fed from the `useWebSocket` hook. *(Blocks: [P3-02])*
- [x] **[P3-19]** Add a server-wide default map centre and zoom (admin-configurable, exposed via a settings API endpoint), with an optional per-mission override so the map snaps to the mission area on activation. The frontend reads this on load and uses it as the initial view. Site-level config deferred to Phase 5; for now a single deployment-wide default suffices. *(Requires: [P3-01]; see also: Phase 5 Org/Site multi-tenancy)* *(`MapDefaults` is a single admin-edited row falling back to the `MAP_DEFAULT_*` settings; `GET /api/v1/settings/map/` resolves it against the active mission's `map_latitude`/`map_longitude`/`map_zoom` override and reports which one it used, so the frontend re-centres on a mission snap but leaves a panned map alone on a refetch.)*
- [x] **[P3-20]** On first load (or when no saved centre exists), attempt to centre the map on the user's device location via the browser Geolocation API, falling back to the hardcoded default if permission is denied or unavailable. *(Requires: [P3-01])* *(`useGeolocation` asks once on mount; `resolveInitialView` ranks an active mission's override above the device fix, and the fix above the [P3-19] default. A permission prompt left unanswered blocks `getCurrentPosition` indefinitely, so a 3s grace period releases the default rather than stranding the map on its built-in view — a fix granted later still applies, unless the operator has dragged or zoomed the map in the meantime.)*
- [x] **[P3-02]** Implement the signal coverage heatmap layer using `leaflet-heat` as the default visible layer. *(Requires: [P3-01])*
- [x] **[P3-03]** Implement "Manual Pinning" mode for ground stations (frontend state management).
- [x] **[P3-04]** Create UI for adding and editing manual ground stations. *(Requires: [P3-03])*
- [x] **[P3-05]** Implement signal strength history charts (e.g., Recharts). Wrap the panel in the `ErrorBoundary` from [P3-18]. *(Requires: [P3-01], [P3-18])* *(`SignalCharts` is a collapsible panel below the map, boundaried as "Signal history". It plots RSSI against `captured_at` for one node, one line per radio/band/receiver link, from `GET /api/v1/snapshots/?node=` — the trailing `DRF_PAGE_SIZE` window, polled every 15 s. Series labels resolve through `/api/v1/radios/`, `/api/v1/nodes/` and the new read-only `/api/v1/stations/`; losing a lookup degrades a label to its id but never the trace. The panel opens closed and fetches nothing until expanded, and Recharts is a lazy chunk, so the coverage map's initial bundle is unchanged. The legend is HTML rather than the chart's SVG one: it doubles as the per-series filter and is glove-sized.)*
- [x] **[P3-06]** Write Playwright E2E tests for UAV marker placement and movement. *(Requires: [P3-01])* *(`e2e/uav-markers.spec.ts`, on the shared `e2e/harness.ts`: it stubs the REST surface, serves the viewport as a mission override so the map is on a known centre without waiting out the geolocation grace period, and mocks `/ws/nodes/` with `routeWebSocket` so a test pushes telemetry frames itself — no backend or device needed. Covered: the overlay staying off until switched on, a marker landing on the pane centre for a node reporting the map's centre coordinate, movement updating the one marker rather than adding another, a buffered late arrival not dragging the marker backwards, two UAVs tracked independently, and the overlay clearing and restoring. Markers are located by `title`, which is now the node name rather than Leaflet's "Marker". The suite immediately found that every live UAV marker crashed the overlay: react-leaflet forwards props to Leaflet as options, so the explicit `icon={undefined}` overwrote `Marker`'s own default and threw in `_initIcon` — live nodes now name `L.Icon.Default` themselves.)*
- [ ] **[P3-07]** Write Playwright E2E tests for heatmap visibility. *(Requires: [P3-02])*

## Mission & Phase Management

- [x] **[P3-08]** Implement `Mission` model: name, operator notes, status (`active` / `completed` / `archived`), site FK (nullable until Phase 5). Generate and apply migration. *(Blocks: [P3-09], [P3-10], [P3-11], [P3-12], Phase 9, [P11-03])*
- [x] **[P3-09]** Implement `MissionPhase` model: mission FK, name, area-of-operation notes, ground-station layout description. Phase boundaries are defined by `captured_at` timestamp windows rather than a FK on each snapshot, keeping ingest writes cheap. Generate and apply migration. *(Requires: [P3-08]; Blocks: [P3-10], Phase 9)*
- [x] **[P3-10]** Implement Mission lifecycle API endpoints: create, start, stop, and archive. *(Requires: [P3-08]; Blocks: [P3-11])*
- [x] **[P3-11]** Implement MissionPhase API endpoints: create phase, switch active phase, close phase. *(Requires: [P3-09], [P3-10])*
- [x] **[P3-12]** Add Mission control UI: start/stop/archive buttons, active mission indicator, and phase management panel showing the current phase and allowing phase switching. *(Requires: [P3-10], [P3-11])*
- [x] **[P3-13]** Write integration tests for the full mission and phase lifecycle: create → start → add phases → switch phases → stop → archive. *(Requires: [P3-10], [P3-11])*

## Lost Contact & Stale Node Handling

- [x] **[P3-14]** Add stale-node UI: nodes whose most recent `captured_at` exceeds a configurable timeout are shown with a "last seen X minutes ago" label and a distinct marker style (greyed, warning icon). Distinguish link-degraded (intermittent recent data) from fully lost (no data in timeout window). *(Requires: [P1-17])*

## Testing & Field Tools

- [x] **[P3-15]** Create a Python script to simulate a UAV flight path with configurable RadioReading values per radio/band/ground station for development and field testing. *(Referenced by: [P10-11], [P14-07])*
- [ ] **[P3-16]** Perform a "High-Glare" UI audit: verify all interactive elements meet WCAG AA contrast ratios and are operable with gloves (minimum 44 px touch targets). *(Referenced by: [P13-06])*
- [x] **[P3-18]** Wrap each major UI panel (Map, Sidebar, MissionControl, AlertPanel, SignalCharts) in a React `ErrorBoundary`. A crash in any one panel must show a contained fallback without affecting the others. The map layer displaying coverage gaps must remain functional even if all other panels fail. *(Done for the panels that exist: Map, Sidebar, MissionControl, SignalCharts, the ground-station roster/form, and each map layer individually. The AlertPanel ([P10-05]) must be wrapped in `ErrorBoundary` as it lands.)*

## Unit Preferences

- [ ] **[P3-17]** Implement unit preferences stored per-user in the backend: altitude in metres or feet, distances in km or miles. Frontend reads the preference on login and applies it consistently throughout all displays, charts, and exported data. Can be scaffolded with a browser-local default before Phase 4 user auth is available. *(Requires for per-user persistence: Phase 4; Referenced by: [P13-01])*
