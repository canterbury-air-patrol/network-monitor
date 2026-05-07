# Phase 7: Signal Propagation Modeling — Flat Model

> **Requires:** Phase 5 complete (Site model with per-site ground station data), Phase 1 Celery setup [P1-24].
>
> This phase implements a theoretical free-space RF propagation model. It deliberately ignores terrain topology; terrain-aware modeling is in Phase 8.
>
> Because each device has multiple radios operating on multiple bands, the LDPL function takes frequency as a parameter. The coverage API aggregates across all ground stations on all bands, returning the best predicted RSSI per grid cell.

- [ ] **[P7-01]** Implement the LDPL algorithm in Python as a pure function accepting frequency (Hz), distance, path-loss exponent, transmit power (dBm), and antenna gain (dBi). No Django dependencies. *(Blocks: [P7-03], [P7-06], [P7-07], Phase 10)*
- [ ] **[P7-02]** Add `antenna_gain_dbi` and `tx_power_dbm` fields to the Ground Station model (one set per station for Phase 7; per-band per-station antenna configuration is a Phase 8 enhancement). Generate and apply migration. *(Blocks: [P7-03])*
- [ ] **[P7-03]** Implement a coverage computation Celery task: for each grid cell in the mission area, compute predicted RSSI from every ground station on every band and return the best value per cell. Expose the result via API endpoint. *(Requires: [P7-01], [P7-02], [P1-24]; Blocks: [P7-04], [P7-05], [P7-08], Phase 10)*
- [ ] **[P7-04]** Implement a "Predicted Coverage" heatmap overlay in the frontend, driven by the [P7-03] computation. *(Requires: [P7-03])*
- [ ] **[P7-05]** Add a drag-and-drop "Virtual Ground Station" to the map for interactive coverage preview; re-triggers the [P7-03] task with the virtual station included. *(Requires: [P7-04])*
- [ ] **[P7-06]** Implement backend logic comparing per-band LDPL-predicted RSSI to actual `RadioReading` values and surfacing the delta per (radio, band, ground station) via API. *(Requires: [P7-01])*
- [ ] **[P7-07]** Write unit tests for the LDPL function against published reference values for each supported frequency band. *(Requires: [P7-01])*
- [ ] **[P7-08]** Implement `GET /api/v1/sites/{site_id}/coverage.geojson` returning the current aggregated predicted coverage as a GeoJSON `FeatureCollection` (point grid with RSSI as a feature property). The response must be usable directly as a `L.geoJSON()` layer in any external Leaflet-based tool without additional transformation. *(Requires: [P7-03])*
