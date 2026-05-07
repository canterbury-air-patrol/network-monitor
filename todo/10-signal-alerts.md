# Phase 10: Coverage Gap Alerting

> **Requires:** Phase 7 complete (LDPL model from [P7-01], coverage API from [P7-03]).
>
> **Primary alert:** coverage gaps in the mission area — zones where no ground station provides adequate signal on any band. This is the operationally critical display; the mission area view must make gaps immediately obvious.
>
> **Secondary alert:** per-UAV radio signal trend decline. UAV position is tracked by external systems; these alerts are informational overlays, suppressible when a UAV is already in a known gap area.

## Coverage Gap Detection (Primary)

- [ ] **[P10-01]** Implement coverage gap analysis as a Celery task: given the mission area polygon and LDPL predictions for all ground stations across all bands, identify grid cells where no (radio, band, ground station) combination achieves the minimum adequate RSSI. *(Requires: [P7-01], [P1-24]; Blocks: [P10-02], [P10-03], [P10-09])*
- [ ] **[P10-02]** Define configurable coverage adequacy thresholds per site: minimum RSSI per band, grid resolution for analysis. Stored in the backend, editable per site. *(Requires: [P10-01])*
- [ ] **[P10-03]** Implement coverage gap overlay as the primary map layer: render uncovered grid cells as a visually distinct highlight. This layer should be on by default and take visual precedence over all other overlays. *(Requires: [P10-01]; Referenced by: [P13-03])*
- [ ] **[P10-04]** Re-run coverage gap analysis automatically when the ground station network changes (station goes offline, antenna parameters updated, new station added). Push updated gap geometry to connected clients via WebSocket. *(Requires: [P10-01])*
- [ ] **[P10-05]** Add a persistent alert panel and Toast notifications for new or expanding coverage gaps, reporting which area and which bands are affected. *(Requires: [P10-03]; Referenced by: [P13-03])*

## Per-UAV Signal Trend Analysis (Secondary)

- [ ] **[P10-06]** Implement signal trend analysis per radio per band: detect a sustained RSSI drop over a configurable sliding window. Run as a lightweight check on each batch ingest. *(Blocks: [P10-07], [P10-10])*
- [ ] **[P10-07]** Define configurable "Warning" and "Critical" RSSI-drop thresholds per site per band. *(Requires: [P10-06])*
- [ ] **[P10-08]** Add per-UAV alert indicators (marker styling, Toast) for radios in trend-decline. Suppress or downgrade if the UAV is already inside a known coverage gap from [P10-03]. *(Requires: [P10-06], [P10-03])*

## Tests

- [ ] **[P10-09]** Write unit tests for the coverage gap algorithm: fully covered area returns no gaps; a station dropout exposes a gap; multi-band coverage correctly selects the best available band. *(Requires: [P10-01])*
- [ ] **[P10-10]** Write unit tests for trend analysis edge cases: window boundary conditions, sudden recovery, simultaneous multi-radio decline. *(Requires: [P10-06])*
- [ ] **[P10-11]** Create a simulation scenario using the flight path simulator [P3-15] with a configured ground station layout to verify coverage gaps appear and alerts fire at the expected threshold crossings. *(Requires: [P3-15], [P10-02], [P10-07])*
