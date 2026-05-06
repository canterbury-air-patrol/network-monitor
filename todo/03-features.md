# Phase 3: UAV Features & Ground Stations

> **Requires:** Phase 2 complete.

- [ ] **[P3-01]** Implement Map component with real-time UAV markers fed from the `useWebSocket` hook.
- [ ] **[P3-02]** Add signal coverage heatmap layer using `leaflet-heat`. *(Requires: [P3-01])*
- [ ] **[P3-03]** Implement "Manual Pinning" mode for ground stations (frontend state management).
- [ ] **[P3-04]** Create UI for adding and editing manual ground stations. *(Requires: [P3-03])*
- [ ] **[P3-05]** Implement signal strength history charts (e.g., Recharts). *(Requires: [P3-01])*
- [ ] **[P3-06]** Write Playwright E2E tests for UAV marker placement and movement. *(Requires: [P3-01])*
- [ ] **[P3-07]** Write Playwright E2E tests for heatmap visibility. *(Requires: [P3-02])*
- [ ] **[P3-08]** Create a Python script to simulate a UAV flight path for development and field testing. *(Referenced by: [P10-07])*
- [ ] **[P3-09]** Perform a "High-Glare" UI audit: verify all interactive elements meet WCAG AA contrast ratios and are operable with gloves (minimum 44 px touch targets). *(Referenced by: [P13-06])*
