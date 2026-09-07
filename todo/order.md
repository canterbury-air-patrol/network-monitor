# Implementation Order

A tiered priority list derived from the dependency markers in `00-research.md` and `01-backend.md` through `16-production.md`. Tiers are ordered top-to-bottom; tasks within a tier can be tackled in parallel unless an internal dependency is noted.

Tasks already complete are not repeated here — see the checkboxes in each phase file for live state.

**Cleared since the last revision:** `[P12-02]` Playwright visual regression — eleven baselines committed under `frontend/e2e/__screenshots__/`, rendered and enforced in the pinned Playwright image that `run-e2e.sh` and CI both run. Phase 3 remains complete, so the Phase 6, Phase 9, `[P13-01]` and `[P13-04]` gates are still clear.

## Tier 1 — Remaining test infrastructure (no unmet dependencies)

1. `[P12-05]` Telemetry replay tool *(pairs with the `[P3-15]` simulator and the `[P12-03]` stress harness)*
2. `[P12-04]` `tc netem` jitter simulation in the dev environment *(blocks the `[P13-06]` field-testing entry)*

## Tier 2 — Authentication (Phase 4)
Nothing in Phase 3 is holding this back any more, so this is the critical path: `[P4-09]` is the enforcement gate that unlocks Phase 5, and `[P4-05]` unlocks Phase 14. Start here if only one thread is available.

3. `[P4-01]` `djangorestframework-simplejwt`
4. `[P4-02]` Login/logout API, `IsAuthenticated` on writes
5. `[P4-03]` Frontend login + in-memory token management
6. `[P4-04]` Auth-flow integration tests
7. `[P4-10]` JWT validation in WebSocket consumer
8. `[P4-11]` WS auth tests
9. `[P4-05]` Device model + API key, per the `[R-03]` decision *(unblocks Phase 14)*
10. `[P4-06]` Device auth middleware
11. `[P4-07]` Device registration + key rotation UI in admin
12. `[P4-08]` Device auth tests
13. `[P4-09]` **Enforcement gate** — `IsAuthenticated` on all remaining endpoints

Once `[P4-03]` lands, revisit `[P3-17]`: the browser-local unit store was built with a `setUnits` seam so a login can write the account's preference through it.

## Tier 3 — Unblocked by the Phase 3 completion (run in parallel with Tier 2)

- **Phase 9** mission playback — both gates (`[P3-09]`, `[P1-17]`) are clear and Phase 3 is done; ready now. `[P9-02]` export is also the first consumer of `formatDistance` from `[P3-17]`.
- **Phase 6** altitude awareness — `[R-01]` resolved as *no 3D library*: Leaflet plus an altitude slider, which makes this phase considerably cheaper than originally scoped. The `[P3-17]` metre/foot formatters are already in place for the slider readout.

## Tier 4 — Gated phases (run in parallel after their gates clear)

After `[P4-05]`:
- **Phase 14** (Device SDK) — starts as soon as the device auth model lands; can run in parallel with Phases 5–10.

After `[P4-09]`:
- **Phase 5** (Org/Site multi-tenancy) → unlocks Phase 7 and Phase 11. Also picks up the site-level map defaults deferred from `[P3-19]`.

After Phase 5:
- **Phase 7** flat RF model (Celery from `[P1-24]` is in place) → required input for Phase 10.
- **Phase 11** audit logging.

After Phase 7:
- **Phase 10** coverage-gap alerts (operationally critical display). Wrap the `[P10-05]` AlertPanel in an `ErrorBoundary` as it lands — `[P3-18]` covers every panel that exists today and left this one noted.
- **Phase 8** terrain-aware RF — `[R-02]` is recorded, so this is gated only on Phase 7.

## Tier 5 — Documentation and production

- **Phase 13** documentation entries land alongside their paired Playwright E2E tests as each feature ships — do not batch at the end. `[P13-01]` (live map view) and `[P13-04]` (manual pinning workflow) are both due now that Phase 3 is complete; `[P13-06]` needs only `[P12-04]`, since `[P3-16]` already specifies the contrast and touch-target assertions for it to run in CI.
- `[P12-06]` Node 26 upgrade is gated on Node 26 LTS (June 2026) and can be picked up at any point after that.
- `[R-04]` offline map tiles guide blocks nothing and belongs in a separate repository — write it when field deployment planning starts (Phase 6 / Phase 16), not before.
- **Phase 16** production deployment last, after `[P4-09]` and the already-complete `[P15-01]`. Internal order: `[P16-01]` → `[P16-02]`, `[P16-03]` → `[P16-04]`, then `[P16-05]` runbook, then `[P16-06]` runbook validator (which closes out `[P13-07]`), then `[P16-07]` → `[P16-08]` backups.
