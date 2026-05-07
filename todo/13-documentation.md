# Phase 13: User Documentation

> Each item must be committed alongside its paired Playwright E2E test (see AGENTS.md §2). A documentation entry without a passing E2E test is not complete, and an E2E test without documentation is not complete.

- [ ] **[P13-01]** Document the live map view: UAV markers, signal heatmap, and ground station pins. **E2E:** navigate to the map, wait for a simulated UAV marker, and assert all documented UI elements are visible. *(Requires: Phase 3 complete)*

- [ ] **[P13-02]** Document the Playback Controller workflow: loading a mission, scrubbing the timeline, and exporting. **E2E:** load a seeded mission, play it back, scrub to the midpoint, and download KML — assert the file is non-empty with the correct structure. *(Requires: [P9-06])*

- [ ] **[P13-03]** Document the Coverage Gap Alert system: configuring adequacy thresholds, reading the gap overlay, and interpreting Toast notifications. **E2E:** simulate a ground station dropout and assert the gap overlay appears on the map and the alert panel lists the affected area and bands. *(Requires: [P10-03], [P10-05])*

- [ ] **[P13-04]** Document the Ground Station manual pinning workflow: adding, editing, and removing a manual station. **E2E:** add a manual ground station, reload the page, and assert it persists with the correct position. *(Requires: Phase 3 complete)*

- [ ] **[P13-05]** Document device registration and API key management for field operators: creating a device, issuing a key, and rotating it. **E2E:** create a device in admin, rotate the key, issue a telemetry request with the old key and assert it is rejected, then assert the new key is accepted. *(Requires: [P4-07], [P4-08])*

- [ ] **[P13-06]** Document the Field Testing Protocol: outdoor readability (high-glare conditions), glove operation (touch target sizes), and the connectivity/battery checklist. **E2E:** run the WCAG AA contrast and 44 px touch-target assertions from [P3-16] as an automated accessibility check in CI. *(Requires: [P3-16], [P12-04])*

- [ ] **[P13-07]** Document the production environment setup. This entry is complete only when the automated runbook validation job [P16-06] passes in CI — that job is the proof that the documented steps are correct. *(Requires: [P16-06])*
