# Phase 8: Signal Propagation Modeling — Advanced (Topology-Aware)

> **Requires:** Phase 7 complete (flat RF model as baseline). Research item [R-02] (terrain data source) must be recorded in `todo/00-research.md` before [P8-01] begins.
>
> This phase extends the flat LDPL model with terrain awareness: real elevation profiles, Fresnel zone obstruction, and diffraction loss penalties.

- [ ] **[P8-01]** Integrate the terrain elevation source chosen in [R-02]. Implement a backend service that fetches and caches elevation profiles along the straight-line path between two coordinates. *(Requires: [R-02]; Blocks: [P8-02], [P8-04])*
- [ ] **[P8-02]** Implement Fresnel zone radius calculation for a configurable frequency and path length. *(Requires: [P8-01]; Blocks: [P8-03])*
- [ ] **[P8-03]** Implement Fresnel zone obstruction check: given an elevation profile and the computed Fresnel zone, calculate percentage of clearance and apply a diffraction loss penalty to the signal estimate. *(Requires: [P8-02]; Blocks: [P8-04])*
- [ ] **[P8-04]** Extend the "Predicted Coverage" overlay from [P7-04] to use terrain-aware loss when elevation data is available, falling back transparently to the flat LDPL model when it is not. *(Requires: [P8-01], [P8-03])*
- [ ] **[P8-05]** Write unit tests for Fresnel zone radius calculation and obstruction scoring against published reference scenarios. *(Requires: [P8-02], [P8-03])*
- [ ] **[P8-06]** Write integration tests for the elevation profile fetch, caching, and cache-miss fallback. *(Requires: [P8-01])*
