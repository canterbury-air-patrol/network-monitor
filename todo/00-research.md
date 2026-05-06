# Pre-Implementation Research

These items must be completed and their decisions recorded in the **Decisions** section below before the dependent implementation phases begin. No implementation work in a blocked phase may start until the relevant research item is marked complete.

- [ ] **[R-01]** Select 3D mapping library for Phase 6. Evaluate **CesiumJS**, **deck.gl**, and **Three.js + react-three-fiber** against: bundle size, UAV 3D trajectory rendering quality, Leaflet 2D/3D interoperability, and license terms. Record the chosen library and the reasons for rejecting the others. *(Blocks: Phase 6 — 3D Visualization)*

- [ ] **[R-02]** Select terrain elevation data source for Phase 8 (advanced RF propagation). Evaluate **SRTM 30m**, **Copernicus DEM GLO-30**, and tile-based APIs (**Mapbox Terrain-DEM**, **Open-Elevation**) against: global coverage, resolution, offline/airgapped operation capability, and licensing for commercial use. Record the chosen source, caching strategy, and any coverage gaps. *(Blocks: Phase 8 — Advanced RF Propagation)*

- [ ] **[R-03]** Define reporting device authentication mechanism for Phase 4. Evaluate **pre-shared API keys** (rotatable, per-device), **HMAC-signed requests**, and **device certificates (mTLS)**. Requirements: must be retry-safe over unreliable RF links, must not require a round-trip to authenticate each telemetry packet, and must support pre-provisioning devices before field deployment. Record the chosen mechanism, the device registration flow, and the key/certificate lifecycle (rotation, revocation). *(Blocks: [P4-05] — Device Authentication)*

---

## Decisions

*(Record research outputs here once each item above is resolved.)*
