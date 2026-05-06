# Phase 5: Scaling (Organizations & Multiple Sites)

> **Requires:** Phase 4 complete ([P4-09] enforcement gate passed).

- [ ] **[P5-01]** Design and implement `Organization` model. Generate and apply migration. *(Blocks: [P5-02])*
- [ ] **[P5-02]** Design and implement `Site` model with a foreign key to `Organization`. Generate and apply migration. *(Requires: [P5-01]; Blocks: [P5-03], [P5-04], [P5-06])*
- [ ] **[P5-03]** Add a nullable `site` foreign key to `Node`. Generate migration; document the backfill strategy for assigning existing nodes to a site before the field is made non-nullable in a subsequent migration. *(Requires: [P5-02])*
- [ ] **[P5-04]** Implement `Site`-aware filtering in all backend ViewSets so users only see data for their assigned sites. *(Requires: [P5-02])*
- [ ] **[P5-05]** Add a "Site Switcher" component to the frontend. *(Requires: [P5-04])*
- [ ] **[P5-06]** Update WebSocket consumers to scope broadcasts by Site ID. *(Requires: [P5-02])*
- [ ] **[P5-07]** Write data-isolation tests: confirm a user assigned to Site A cannot read data or receive WebSocket events from Site B. *(Requires: [P5-04], [P5-06])*
