# Pre-Implementation Research

These items must be completed and their decisions recorded in the **Decisions** section below before the dependent implementation phases begin. No implementation work in a blocked phase may start until the relevant research item is marked complete.

- [ ] **[R-01]** Select 3D mapping library for Phase 6. Evaluate **CesiumJS**, **deck.gl**, and **Three.js + react-three-fiber** against: bundle size, UAV 3D trajectory rendering quality, Leaflet 2D/3D interoperability, and license terms. Record the chosen library and the reasons for rejecting the others. *(Blocks: Phase 6 — 3D Visualization)*

- [ ] **[R-02]** Select terrain elevation data source for Phase 8 (advanced RF propagation). Evaluate **SRTM 30m**, **Copernicus DEM GLO-30**, and tile-based APIs (**Mapbox Terrain-DEM**, **Open-Elevation**) against: global coverage, resolution, offline/airgapped operation capability, and licensing for commercial use. Record the chosen source, caching strategy, and any coverage gaps. *(Blocks: Phase 8 — Advanced RF Propagation)*

- [ ] **[R-03]** Define reporting device authentication mechanism for Phase 4. Evaluate **pre-shared API keys** (rotatable, per-device), **HMAC-signed requests**, and **device certificates (mTLS)**. Requirements: must be retry-safe over unreliable RF links, must not require a round-trip to authenticate each telemetry packet, and must support pre-provisioning devices before field deployment. Record the chosen mechanism, the device registration flow, and the key/certificate lifecycle (rotation, revocation). *(Blocks: [P4-05] — Device Authentication)*

- [ ] **[R-05]** Select a frontend state management library before [P2-02]. Evaluate **Zustand**, **Redux Toolkit**, and **React Context + useReducer** against: bundle size, DevTools support, ease of sharing WebSocket state across the map, mission control, and alert components, and TypeScript ergonomics. Record the decision and the reason for rejecting the alternatives. *(Blocks: [P2-02])*

- [ ] **[R-04]** Produce a standalone "Offline Map Tiles" setup guide covering tile caching approaches for field deployments with poor connectivity: service worker caching, a self-hosted tile server (e.g. `tileserver-gl`), and pre-packaged `.mbtiles` files. This guide is not specific to this project and should live in a separate repository. *(Does not block any single task here; referenced when planning field deployments in Phase 6 and Phase 16.)*

---

## Decisions

*(Record research outputs here once each item above is resolved.)*
