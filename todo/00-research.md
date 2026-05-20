# Pre-Implementation Research

These items must be completed and their decisions recorded in the **Decisions** section below before the dependent implementation phases begin. No implementation work in a blocked phase may start until the relevant research item is marked complete.

- [x] **[R-01]** Select 3D mapping library for Phase 6. Evaluate **CesiumJS**, **deck.gl**, and **Three.js + react-three-fiber** against: bundle size, UAV 3D trajectory rendering quality, Leaflet 2D/3D interoperability, and license terms. Record the chosen library and the reasons for rejecting the others. *(Blocks: Phase 6 — 3D Visualization)*

- [x] **[R-02]** Select terrain elevation data source for Phase 8 (advanced RF propagation). Evaluate **SRTM 30m**, **Copernicus DEM GLO-30**, and tile-based APIs (**Mapbox Terrain-DEM**, **Open-Elevation**) against: global coverage, resolution, offline/airgapped operation capability, and licensing for commercial use. Record the chosen source, caching strategy, and any coverage gaps. *(Blocks: Phase 8 — Advanced RF Propagation)*

- [x] **[R-03]** Define reporting device authentication mechanism for Phase 4. Evaluate **pre-shared API keys** (rotatable, per-device), **HMAC-signed requests**, and **device certificates (mTLS)**. Requirements: must be retry-safe over unreliable RF links, must not require a round-trip to authenticate each telemetry packet, and must support pre-provisioning devices before field deployment. Record the chosen mechanism, the device registration flow, and the key/certificate lifecycle (rotation, revocation). *(Blocks: [P4-05] — Device Authentication)*

- [x] **[R-05]** Select a frontend state management library before [P2-02]. Evaluate **Zustand**, **Redux Toolkit**, and **React Context + useReducer** against: bundle size, DevTools support, ease of sharing WebSocket state across the map, mission control, and alert components, and TypeScript ergonomics. Record the decision and the reason for rejecting the alternatives. *(Blocks: [P2-02])*

- [ ] **[R-04]** Produce a standalone "Offline Map Tiles" setup guide covering tile caching approaches for field deployments with poor connectivity: service worker caching, a self-hosted tile server (e.g. `tileserver-gl`), and pre-packaged `.mbtiles` files. This guide is not specific to this project and should live in a separate repository. *(Does not block any single task here; referenced when planning field deployments in Phase 6 and Phase 16.)*

---

## Decisions

### [R-01] Phase 6 altitude visualization — **No 3D library; Leaflet + altitude slider** ✓

The Phase 6 visualization is 2D, not 3D. No additional 3D library is required.

The approach:
- **Altitude labels** on existing react-leaflet UAV markers (text label via `Tooltip` or `DivIcon`).
- **Colors reserved for signal quality** (red = poor, yellow = acceptable, green = good) — altitude is shown only as a label, keeping the color channel unambiguous.
- **Altitude slider in the sidebar** (standard React range input) lets the operator select an altitude slice in 10 m / 100 ft increments; the coverage heatmap updates to show coverage at the selected altitude.
- **UAV altitude dots on the slider** mark each active UAV's current operating altitude so the operator can immediately select the relevant altitude for a given mission.

All of the above is achievable within the existing react-leaflet + Zustand + React stack — zero new npm dependencies.

CesiumJS, deck.gl, and Three.js + react-three-fiber were all evaluated and rejected for Phase 6 as scoped: the requirement is 2D, and adding any 3D library would incur 150 KB – 1 MB+ of unnecessary bundle. If true 3D trajectory rendering is ever needed, deck.gl is the recommended starting point (analysis preserved in `research/R-01-3d-library.md`).

Open questions for [P6-01] implementation: signal-strength color thresholds (dBm → red/yellow/green), altitude slider range and step size, and whether coverage-at-altitude comes from a backend query parameter or frontend filtering.

Full analysis: `research/R-01-3d-library.md`

---

### [R-05] Frontend state library — **Zustand** ✓

Zustand is chosen over Redux Toolkit and React Context + useReducer. The live telemetry WebSocket stream fans out to multiple independent consumers (map, marker overlay, signal charts, alert panel); Zustand's per-slice subscriptions ensure each consumer re-renders only when its slice changes, avoiding the whole-subtree re-renders that Context would cause. The store lives outside React, so the [P2-08] native-WebSocket hook writes to it directly without coupling to a component lifecycle. Bundle is ~1 KB vs Redux Toolkit's ~15 KB.

Owner clarifications recorded:
- Mission playback / time-travel replay is wanted but must live on a **separate page/route** so it cannot be accidentally triggered during a live mission. The live map page and the replay page may use separate stores or isolated store slices.
- Server-cache for REST data (missions, devices, historical queries): defer to [P2-02] implementation; TanStack Query is the natural pairing with Zustand.

Full analysis: `research/R-05-frontend-state-library.md`

---

### [R-02] Terrain elevation data source — **Pluggable provider interface; NZ 10m + Copernicus GLO-30 as shipped sources** ✓

The architecture is a **pluggable elevation provider interface** rather than a hardcoded single source. The system ships with two built-in providers:
1. **NZ LINZ 10m contour / spot-heights data** — higher resolution than any free global DEM; the primary source for NZ deployments.
2. **Copernicus DEM GLO-30** (30m, true global land coverage, ~4m vertical accuracy, free static tiles from AWS Open Data) — the public fallback for non-NZ regions and for deployments without a local data service.

The NZ data is loaded via an optional locally-deployed service (not part of this project). Users may configure additional providers (e.g. national DEMs) via the same interface. Mapbox and Open-Elevation are disqualified (online-only / billing; see full analysis). SRTM is retained as a secondary fallback for areas where Copernicus tiles are unavailable.

Cache-miss behaviour when no elevation data is staged must fail loudly — never silently assume flat terrain, as that produces falsely optimistic Fresnel clearance verdicts.

Full analysis: `research/R-02-terrain-data.md`

---

### [R-03] Device authentication — **Pre-shared API keys via `djangorestframework-api-key`** ✓

Per-device rotatable API keys sent as `Authorization: Api-Key <key>`. The server stores only a hash (non-recoverable, as [P4-05] requires). Retry-safe because the credential is a static bearer string — no per-message state, no nonce/timestamp replay machinery. HMAC rejected because its replay protection is incompatible with retry-safety on lossy RF links. mTLS rejected — PKI exists for UAVs but not other infrastructure, and it would complicate offering the system as a service.

Implementation: use the `djangorestframework-api-key` package (existing, well-maintained) rather than hand-rolling the key model.

Owner clarifications recorded:
- Typical deployment: ≤10 nodes; ≤100 is rare. No need to design for PKI scale.
- Devices with non-IP links (LoRa, Bluetooth) always have a working IP link as well. Non-IP links are used only for aircraft location after landing/crash and emergency C&C; non-critical data is stored or dropped. Auth concern on non-IP links is therefore out of scope — all telemetry arrives via IP.
- Replay protection is delegated to a per-capture UUID idempotency key (survives the offline-buffer flush from [P1-17]).

Full analysis: `research/R-03-device-auth.md`
