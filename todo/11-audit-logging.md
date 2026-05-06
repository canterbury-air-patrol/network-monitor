# Phase 11: Audit & Mission Logging

> **Requires:** Phase 5 complete (Organization model required to scope audit entries by site/org).

- [ ] **[P11-01]** Implement `AuditLog` model with fields: `timestamp`, `user` (FK, nullable for device-initiated actions), `action`, `target_type`, `target_id`, `detail` (JSONField). Generate and apply migration. *(Blocks: [P11-02], [P11-03], [P11-04], [P11-05], [P11-06])*
- [ ] **[P11-02]** Use Django signals (`post_save`, `post_delete`) to write `AuditLog` entries on Ground Station create, update, and delete. Signals are used rather than middleware to keep audit scope tight to model-level events rather than all HTTP traffic. *(Requires: [P11-01])*
- [ ] **[P11-03]** Implement `AuditLog` writes for Mission Start and Mission Stop events. *(Requires: [P11-01])*
- [ ] **[P11-04]** Create an "Audit Trail" dashboard view in the frontend, filterable by user, action type, and time range. *(Requires: [P11-01]; Referenced by: [P13-01])*
- [ ] **[P11-05]** Implement a "Ground Station Performance Report" API endpoint returning per-station uptime percentage, average signal strength, and snapshot count for a caller-supplied time range. *(Requires: [P11-01])*
- [ ] **[P11-06]** Write tests verifying `AuditLog` entries are created for every Ground Station modification and that bulk QuerySet operations do not silently bypass signal handlers. *(Requires: [P11-02])*
