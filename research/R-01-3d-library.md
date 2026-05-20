# R-01: Altitude Visualization for Phase 6

> Status: **Decided** — no 3D library required. See owner responses below.
> Research for Phase 6 (Altitude Awareness). Blocks [P6-01].
>
> **Scope note:** This document was originally framed around choosing a 3D
> mapping library. Owner clarification (2026-05-18) established that the Phase 6
> visualization is 2D — no 3D engine is needed. The 3D library evaluation below
> is retained as a record of what was considered and why all three were rejected
> for this use case. If true 3D trajectory rendering is added in a future phase,
> deck.gl remains the recommended starting point (see original reasoning).

## Context

The app renders a 2D map with **react-leaflet**: UAV positions, coverage
heatmaps, and ground stations. Phase 6 adds altitude awareness to the existing
2D view. Snapshots carry PostGIS `Point Z` `(longitude, latitude, altitude_m)`.
The frontend is Vite + React + TypeScript. The app is field-deployed and may
load over slow links, so **added bundle size is a first-class constraint**.

## Owner responses — 2026-05-18

The owner clarified that Phase 6 does not require a 3D rendering engine. The
desired visualization is:

1. **Altitude labels on UAV markers.** Each UAV marker on the existing Leaflet
   map displays the UAV's current altitude as a text label next to the marker.
2. **Colors reserved for signal quality, not altitude.** Marker/coverage colors
   indicate radio link quality (red = marginal/poor, yellow = acceptable,
   green = good/best). Altitude is shown as a label only, keeping the color
   channel unambiguous.
3. **Altitude slider in the sidebar.** A vertical or horizontal slider lets the
   operator select an altitude slice (in 10 m / 100 ft increments). The coverage
   heatmap updates to show predicted or measured coverage at the selected
   altitude, making it easy to assess performance at a UAV's intended operating
   height.
4. **UAV altitude markers on the slider.** The slider shows a dot or label at
   each active UAV's current operating altitude, so the operator can instantly
   see "UAV A is at 90 m, UAV B is at 150 m" and click the relevant altitude to
   inspect coverage there.

**Conclusion: no 3D library is needed.** All four elements above are achievable
with the existing react-leaflet stack plus standard React UI components (a range
input or a lightweight slider component). No additional npm dependencies beyond
what Phase 2 already installs are required for this feature.

**If true 3D is ever wanted.** The evaluation below remains valid. If a future
phase adds 3D trajectory rendering (e.g. showing historical flight paths as
`altitude_m`-elevated polylines), **deck.gl** is still the recommended choice —
geospatial-native, MIT-licensed, tree-shakeable, and integrates with the
existing Leaflet basemap via `@deck.gl/leaflet`.

## Options evaluated

### 1. CesiumJS

- **Bundle size:** Very large. The `cesium` package is roughly **3–4 MB
  minified, ~1 MB+ gzipped** for the core engine, before its WebGL workers,
  WASM, and asset files (it ships its own static assets — widgets CSS,
  approximate-terrain data, web workers — that must be served alongside).
  Realistically this is the heaviest option by a wide margin and the hardest to
  tree-shake. `resium` (the React wrapper) adds a small amount on top.
- **Trajectory rendering quality:** Excellent and arguably overkill. Full WGS84
  globe, real ellipsoidal geodesy, terrain, time-dynamic entities (`CZML`),
  polylines with per-vertex coloring, and a built-in `entity.trackedEntity`
  that *is* a "follow" camera out of the box. Altitude is native — Cesium is
  built around geocentric 3D coordinates, so `(lon, lat, alt)` maps directly to
  `Cartesian3`. Camera control is the most powerful of the three.
- **Leaflet interop:** None in the sense of sharing a view. Cesium is its own
  full globe engine; you swap the whole map area between Leaflet and Cesium.
  That is acceptable given the toggle design, but Cesium cannot be a "layer"
  over Leaflet.
- **License:** **Apache-2.0** — fully open source, commercial use allowed, no
  fee for the engine itself. Caveat: the *default* terrain/imagery comes from
  **Cesium ion**, a paid SaaS with a free tier. Self-hosting terrain or using
  flat ellipsoid imagery avoids ion entirely, so the license is not a blocker —
  but the "batteries-included" experience nudges you toward a paid service.

### 2. deck.gl

- **Bundle size:** Moderate-to-large but tree-shakeable. The full `deck.gl`
  meta-package is large (~1 MB+ minified), but you can install only the
  scoped sub-packages you actually need (`@deck.gl/core`,
  `@deck.gl/layers`, `@deck.gl/react`). A realistic trajectory-only build lands
  around **~250–400 KB gzipped** — bigger than Three.js, much smaller than
  Cesium. It pulls in `@luma.gl` and `@math.gl` as peers.
- **Trajectory rendering quality:** Purpose-built for exactly this. `PathLayer`
  and `TripsLayer` render large numbers of polylines on the GPU; `PathLayer`
  supports per-segment color via `getColor`, which maps cleanly to
  signal-strength gradients. `TripsLayer` adds time-animated trails (useful for
  mission playback in Phase 9). It is geospatial-native: data is supplied as
  `[longitude, latitude, altitude]` and deck.gl handles the projection,
  including a 3D perspective view via `MapView`/`_GlobeView` or `OrbitView`.
  Camera control is good; "Follow UAV" is implemented by driving the
  `viewState` from React each frame (controlled component) — straightforward but
  you write the follow logic yourself.
- **Leaflet interop:** **Best of the three.** deck.gl has a documented
  `LeafletLayer` integration (via `@deck.gl/leaflet`) that overlays deck.gl
  layers *on top of an existing Leaflet map*, sharing the same viewport. Even
  in a toggle design this is valuable: a 3D-tilted deck.gl view can reuse the
  existing Leaflet basemap tiles instead of bundling a second basemap engine.
- **License:** **MIT** (deck.gl, luma.gl, math.gl are all MIT under the OpenJS
  Foundation / vis.gl). Fully open, commercial use allowed, no SaaS dependency.

### 3. Three.js + react-three-fiber

- **Bundle size:** Smallest of the three. `three` is roughly **~600 KB
  minified, ~150 KB gzipped**, and is well tree-shaken by Vite/Rollup so a
  trajectory-only scene imports far less. `@react-three/fiber` adds ~30–50 KB
  gzipped; `@react-three/drei` (helpers, optional) adds more but is itself
  tree-shakeable. A lean build can stay **under ~200 KB gzipped**.
- **Trajectory rendering quality:** Capable but **not geospatial**. Three.js is
  a general 3D engine — it has no concept of longitude/latitude or a globe. You
  must write the coordinate transformation yourself: project `(lon, lat, alt)`
  into a local ENU / Cartesian scene (e.g. equirectangular or local tangent
  plane), which is acceptable for a regional UAV deployment but is code you own
  and must test ([P6-06] explicitly calls for coordinate-transform tests).
  Lines are drawn with `Line2`/`LineGeometry` (fat lines) which support
  per-vertex vertex colors for signal gradients. `OrbitControls` gives camera
  control; "Follow UAV" means manually updating the camera target each frame.
- **Leaflet interop:** None built in. You either render Three.js in its own
  canvas (fine for the toggle design) or hand-roll a sync layer. No basemap
  tiles unless you build that yourself.
- **License:** **MIT** for `three`, `@react-three/fiber`, and `@react-three/drei`.
  Fully open, commercial use allowed.

## Comparison table

| Criterion | CesiumJS | deck.gl | Three.js + R3F |
|---|---|---|---|
| Added bundle (gzipped, realistic) | ~1 MB+ (+ static assets) | ~250–400 KB | ~150–200 KB |
| Tree-shakeable | Poor | Good (scoped pkgs) | Excellent |
| Geospatial-native (lon/lat/alt) | Yes (full WGS84 globe) | Yes | **No** — you build it |
| Polyline + per-vertex color | Yes | Yes (`PathLayer.getColor`) | Yes (`Line2` vertex colors) |
| Time-animated trails | Yes (CZML) | Yes (`TripsLayer`) | Manual |
| "Follow UAV" camera | Built in (`trackedEntity`) | Drive `viewState` (DIY) | Drive camera (DIY) |
| Reuse existing Leaflet basemap | No | **Yes** (`@deck.gl/leaflet`) | No |
| License | Apache-2.0 (ion is paid SaaS) | MIT | MIT |
| Coordinate-transform code you own | None | Minimal | Significant |
| Field-deploy / offline friendliness | Weak (assets, ion tiles) | Good | Good |

## Recommendation

**No 3D library.** Phase 6 altitude awareness is implemented entirely within the
existing react-leaflet + React stack:

- Altitude text labels rendered via react-leaflet `Tooltip` or custom
  `DivIcon` on each UAV marker.
- Altitude slider: a React range input (or a lightweight slider component
  already in the UI library chosen for Phase 2) bound to Zustand state.
- UAV altitude indicators on the slider: dots positioned by CSS `bottom`
  percentage, derived from the UAV's `altitude_m` relative to the slider range.
- Coverage heatmap filtered by selected altitude: the query or store selector
  already receives `altitude_m` — adding a filter on the slider value is a
  small change to the data pipeline.

Zero new npm dependencies beyond the Phase 2 baseline are required for this
feature.

## Why all three 3D libraries were rejected (for Phase 6 as scoped)

**CesiumJS, deck.gl, and Three.js + react-three-fiber were all rejected** for
the same reason: the actual visualization requirement is 2D. Adding any of these
libraries for altitude labels and a slider would incur 150 KB – 1 MB+ of
unnecessary gzipped bundle, with no user-visible benefit over a `<input
type="range">` and a react-leaflet tooltip.

The 3D library analysis below is preserved for the record. If a future phase
adds true 3D trajectory rendering, deck.gl is the recommended entry point —
see the comparison table and reasoning in the original evaluation.

## Open questions

1. **Signal-strength color scale.** [P6-03] needs a defined RSSI → color
   mapping (e.g. thresholds in dBm for red / yellow / green). Owner should
   confirm the thresholds so the Leaflet coverage heatmap and the altitude
   slider's coverage readout stay visually consistent.
2. **Altitude slider range.** Define the minimum and maximum altitude the slider
   covers (e.g. 0–500 m AGL) and the step size (10 m / 100 ft). Confirm
   whether the range is fixed or adapts to the current UAV fleet's altitude
   envelope.
3. **Coverage data at arbitrary altitudes.** The slider implies the backend can
   return (or the frontend can interpolate) coverage predictions at the selected
   altitude. Confirm whether [P6-02] / the RF model API will accept an `altitude`
   query parameter, or whether the frontend filters snapshot history by altitude
   band. This affects the data pipeline design for [P6-01].
