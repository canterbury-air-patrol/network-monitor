# Phase 7: Signal Propagation Modeling — Flat Model

> **Requires:** Phase 5 complete (Site model with per-site ground station antenna data).
>
> This phase implements a theoretical free-space RF propagation model. It deliberately ignores terrain topology; terrain-aware modeling is in Phase 8.

- [ ] **[P7-01]** Implement the Log-Distance Path Loss (LDPL) algorithm in Python as a pure function with no Django dependencies, to keep it independently testable. *(Blocks: [P7-03], [P7-05], [P7-06])*
- [ ] **[P7-02]** Add `antenna_gain_dbi` and `tx_power_dbm` fields to the Ground Station model. Generate and apply migration. *(Blocks: [P7-03])*
- [ ] **[P7-03]** Expose a backend API endpoint that returns LDPL-predicted signal strength for a given position relative to a ground station. *(Requires: [P7-01], [P7-02]; Blocks: [P7-04])*
- [ ] **[P7-04]** Implement a "Predicted Coverage" overlay layer in the frontend, driven by the [P7-03] endpoint. *(Requires: [P7-03]; Referenced by: [P10-03])*
- [ ] **[P7-05]** Add a drag-and-drop "Virtual Ground Station" to the map for interactive coverage preview. *(Requires: [P7-04])*
- [ ] **[P7-06]** Implement backend logic comparing LDPL-predicted signal to recorded snapshot signal and surfacing the delta via API. *(Requires: [P7-01])*
- [ ] **[P7-07]** Write unit tests for the LDPL calculation against published reference values. *(Requires: [P7-01])*
