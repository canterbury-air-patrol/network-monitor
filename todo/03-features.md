# Phase 3: UAV Features & Ground Stations

> **Requires:** Phase 2 complete.

## Map & Real-time Display

> **Display priority:** RF coverage over the mission area is the primary display. UAV position is tracked by two external systems and is a secondary overlay. The coverage gap layer (Phase 10) should be on by default; UAV markers are optional and off by default. Design the map component with this hierarchy from the start.

- [ ] **[P3-01]** Implement Map component with a coverage heatmap as the primary layer and real-time UAV position markers as a toggleable secondary overlay fed from the `useWebSocket` hook. *(Blocks: [P3-02])*
- [ ] **[P3-02]** Implement the signal coverage heatmap layer using `leaflet-heat` as the default visible layer. *(Requires: [P3-01])*
- [ ] **[P3-03]** Implement "Manual Pinning" mode for ground stations (frontend state management).
- [ ] **[P3-04]** Create UI for adding and editing manual ground stations. *(Requires: [P3-03])*
- [ ] **[P3-05]** Implement signal strength history charts (e.g., Recharts). *(Requires: [P3-01])*
- [ ] **[P3-06]** Write Playwright E2E tests for UAV marker placement and movement. *(Requires: [P3-01])*
- [ ] **[P3-07]** Write Playwright E2E tests for heatmap visibility. *(Requires: [P3-02])*

## Mission & Phase Management

- [ ] **[P3-08]** Implement `Mission` model: name, operator notes, status (`active` / `completed` / `archived`), site FK (nullable until Phase 5). Generate and apply migration. *(Blocks: [P3-09], [P3-10], [P3-11], [P3-12], Phase 9, [P11-03])*
- [ ] **[P3-09]** Implement `MissionPhase` model: mission FK, name, area-of-operation notes, ground-station layout description. Phase boundaries are defined by `captured_at` timestamp windows rather than a FK on each snapshot, keeping ingest writes cheap. Generate and apply migration. *(Requires: [P3-08]; Blocks: [P3-10], Phase 9)*
- [ ] **[P3-10]** Implement Mission lifecycle API endpoints: create, start, stop, and archive. *(Requires: [P3-08]; Blocks: [P3-11])*
- [ ] **[P3-11]** Implement MissionPhase API endpoints: create phase, switch active phase, close phase. *(Requires: [P3-09], [P3-10])*
- [ ] **[P3-12]** Add Mission control UI: start/stop/archive buttons, active mission indicator, and phase management panel showing the current phase and allowing phase switching. *(Requires: [P3-10], [P3-11])*
- [ ] **[P3-13]** Write integration tests for the full mission and phase lifecycle: create → start → add phases → switch phases → stop → archive. *(Requires: [P3-10], [P3-11])*

## Lost Contact & Stale Node Handling

- [ ] **[P3-14]** Add stale-node UI: nodes whose most recent `captured_at` exceeds a configurable timeout are shown with a "last seen X minutes ago" label and a distinct marker style (greyed, warning icon). Distinguish link-degraded (intermittent recent data) from fully lost (no data in timeout window). *(Requires: [P1-17])*

## Testing & Field Tools

- [ ] **[P3-15]** Create a Python script to simulate a UAV flight path with configurable RadioReading values per radio/band/ground station for development and field testing. *(Referenced by: [P10-11], [P14-07])*
- [ ] **[P3-16]** Perform a "High-Glare" UI audit: verify all interactive elements meet WCAG AA contrast ratios and are operable with gloves (minimum 44 px touch targets). *(Referenced by: [P13-06])*
- [ ] **[P3-18]** Wrap each major UI panel (Map, Sidebar, MissionControl, AlertPanel, SignalCharts) in a React `ErrorBoundary`. A crash in any one panel must show a contained fallback without affecting the others. The map layer displaying coverage gaps must remain functional even if all other panels fail.

## Unit Preferences

- [ ] **[P3-17]** Implement unit preferences stored per-user in the backend: altitude in metres or feet, distances in km or miles. Frontend reads the preference on login and applies it consistently throughout all displays, charts, and exported data. Can be scaffolded with a browser-local default before Phase 4 user auth is available. *(Requires for per-user persistence: Phase 4; Referenced by: [P13-01])*
