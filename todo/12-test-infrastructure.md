# Phase 12: Advanced Testing & Field Validation

> **Requires:** Phase 3 complete (Playwright visual regression baselines require a working UI).
>
> Note: The GitHub Actions CI pipeline ([P12-01]) can and should be set up as soon as Phase 1 is complete — it is listed here for grouping but is not blocked by Phases 4–11.

- [ ] **[P12-01]** Configure **GitHub Actions** CI pipeline: Dockerized backend tests (`pytest` + PostGIS) and frontend tests (`vitest` + Playwright) run on every pull request. *(Can begin after Phase 1; blocks nothing else in this phase)*
- [ ] **[P12-02]** Implement automated Playwright visual regression with baseline screenshots committed to the repository. *(Requires: Phase 3, [P12-01])*
- [ ] **[P12-03]** Create a stress-test script simulating 50+ concurrent WebSocket connections against the Channels layer and report message latency and drop rate.
- [ ] **[P12-04]** Implement "Network Jitter" simulation in the dev environment using `tc netem` inside Docker (configurable packet loss and latency). *(Referenced by: field testing in [P13-06])*
- [ ] **[P12-05]** Build a Telemetry Replay tool that replays a captured session from a JSON file for deterministic bug reproduction.
- [ ] **[P12-06]** Upgrade environment to Node.js 26. *(Do not begin before Node 26 reaches LTS status — scheduled June 2026.)*
- [ ] **[P12-07]** Add `pip-audit` to the GitHub Actions CI pipeline as a blocking gate: fail the build on any known CVE in Python dependencies. Run on every PR and on a nightly schedule against the main branch. *(Requires: [P12-01])*
- [ ] **[P12-08]** Add `npm audit --audit-level=high` to the GitHub Actions CI pipeline as a blocking gate for high-severity JS dependency CVEs. Run on every PR. *(Requires: [P12-01])*
