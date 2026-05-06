# Phase 9: Historical Playback (Mission Debrief)

> **Requires:** Phase 3 complete.

- [ ] **[P9-01]** Implement backend API endpoint to query `NodeSnapshot` records by time range. *(Blocks: [P9-03], [P9-04], [P9-05], [P9-07])*
- [ ] **[P9-02]** Implement backend export endpoints: `GET /api/missions/{id}/export.kml` and `GET /api/missions/{id}/export.csv`. *(Blocks: [P9-06])*
- [ ] **[P9-03]** Create "Playback Controller" UI component (Play / Pause / Scrub). *(Requires: [P9-01]; Blocks: [P9-04], [P9-05])*
- [ ] **[P9-04]** Implement frontend state management for historical time-scrubbing. *(Requires: [P9-03])*
- [ ] **[P9-05]** Add a synchronized "Timeline" view component. *(Requires: [P9-03])*
- [ ] **[P9-06]** Connect frontend "Export Mission" buttons to the endpoints implemented in [P9-02]. *(Requires: [P9-02]; Referenced by: [P13-02])*
- [ ] **[P9-07]** Write integration tests for time-range snapshot fetching and both export formats (KML and CSV). *(Requires: [P9-01], [P9-02])*
