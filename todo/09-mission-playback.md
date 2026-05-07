# Phase 9: Historical Playback (Mission Debrief)

> **Requires:** Phase 3 complete (Mission model from [P3-08], MissionPhase model from [P3-09]).
>
> Playback is structured around missions and their phases. Phase boundaries are defined by `captured_at` timestamp windows, so all queries must use `captured_at` ordering to correctly handle snapshots uploaded after link recovery.

- [ ] **[P9-01]** Implement backend API endpoints to query `NodeSnapshot` records by mission, by phase, and by arbitrary time range. Order results by `captured_at` (not `received_at`) to handle out-of-order submissions from devices recovering after link loss. *(Requires: [P3-09], [P1-17]; Blocks: [P9-04], [P9-05], [P9-06], [P9-08])*
- [ ] **[P9-02]** Implement export endpoints for KML and CSV at both levels: per-phase (`GET /api/missions/{id}/phases/{pid}/export.{fmt}`) and per-mission (`GET /api/missions/{id}/export.{fmt}`). *(Requires: [P3-09]; Blocks: [P9-07])*
- [ ] **[P9-03]** Implement mission archive endpoint: marks the mission `archived`, freezes the snapshot window, and produces a downloadable package containing KML, CSV, and a mission metadata JSON (phases, operator notes, ground station layout at each phase). *(Requires: [P3-10])*
- [ ] **[P9-04]** Create "Playback Controller" UI component (Play / Pause / Scrub) operating at the phase or full-mission level. *(Requires: [P9-01]; Blocks: [P9-05], [P9-06])*
- [ ] **[P9-05]** Implement frontend state management for historical time-scrubbing, accounting for gaps in `captured_at` timestamps where the link was down (do not interpolate across gaps). *(Requires: [P9-04])*
- [ ] **[P9-06]** Add a synchronized "Timeline" view showing phases as labelled bands with snapshot density as a histogram, making link-loss gaps visually obvious. *(Requires: [P9-04])*
- [ ] **[P9-07]** Connect frontend export and archive buttons to the [P9-02] and [P9-03] endpoints. *(Requires: [P9-02], [P9-03], [P9-04]; Referenced by: [P13-02])*
- [ ] **[P9-08]** Write integration tests for: time-range queries ordered by `captured_at`, out-of-order batch submissions appearing in the correct playback position, both export formats at phase and mission level, and archive package structure and completeness. *(Requires: [P9-01], [P9-02], [P9-03])*
