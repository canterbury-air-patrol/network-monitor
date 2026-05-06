# Phase 10: Likely-to-Lose-Signal Alerting

> **Requires:** Phase 7 complete — the connectivity buffer radius ([P10-03]) is derived from the LDPL model output in [P7-03].

- [ ] **[P10-01]** Implement a "Signal Trend" analyzer in Python: detect a sustained dBm drop over a configurable sliding window. *(Blocks: [P10-02], [P10-06])*
- [ ] **[P10-02]** Define configurable "Warning" and "Critical" dBm-drop thresholds, stored per site in the backend. *(Requires: [P10-01])*
- [ ] **[P10-03]** Implement "Connectivity Buffer" visual circle on the map; radius is calculated from the LDPL model endpoint ([P7-03]). *(Requires: [P7-03]; Referenced by: [P13-03])*
- [ ] **[P10-04]** Add real-time Toast notifications for predicted signal-loss events, pushed to the frontend via WebSocket.
- [ ] **[P10-05]** Implement pulsing red marker animation for UAVs inside the danger zone. *(Referenced by: [P13-03])*
- [ ] **[P10-06]** Write unit tests for the trend analysis logic, including edge cases for window boundaries and sudden signal recovery. *(Requires: [P10-01])*
- [ ] **[P10-07]** Create a simulation scenario using the flight path simulator from [P3-08] to verify that alert notifications fire at the expected threshold crossings. *(Requires: [P3-08], [P10-02])*
