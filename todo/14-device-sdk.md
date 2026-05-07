# Phase 14: Device Client SDK

> **Requires:** Phase 1 complete (telemetry API stable), Phase 4 complete ([P4-05] device auth model). Research item [R-03] must be recorded before [P14-02].
>
> The SDK is a standalone Python package (`network-monitor-client`) that reporting devices (UAVs, ground stations) use to submit telemetry. It is also used as the canonical integration test client — integration tests that previously hand-crafted raw HTTP calls are migrated to the SDK so the same code path is exercised in tests and in production firmware.
>
> The package is published so that device firmware authors can install it without needing access to this repository. It may be developed in parallel with Phases 5–10 once Phases 1 and 4 are complete; it is grouped here for clarity rather than strict sequencing.

- [ ] **[P14-01]** Create the `sdk/` directory with `pyproject.toml`, a versioning scheme independent of the main service, and CI publishing configuration (GitHub Actions, publishing to PyPI on tag). *(Blocks: all remaining tasks in this phase)*
- [ ] **[P14-02]** Implement `TelemetryClient`: authenticates with the device API key mechanism from [R-03], submits a single snapshot, handles HTTP errors with configurable retry and back-off. *(Requires: [P4-05]; Blocks: [P14-03], [P14-04], [P14-06])*
- [ ] **[P14-03]** Implement offline buffering: persist unsent snapshots to a local SQLite file on the device, preserving the original `captured_at` timestamp. Flush the buffer in batches using the batch ingest endpoint from [P1-17] when connectivity is restored. *(Requires: [P14-02], [P1-17])*
- [ ] **[P14-04]** Implement a mission context manager: `with client.mission("name") as m: m.phase("Phase 1")` handles start/stop/phase-switch API calls so device scripts are structured around mission events rather than raw HTTP. *(Requires: [P14-02], [P3-10], [P3-11])*
- [ ] **[P14-05]** Migrate backend integration tests that hand-craft telemetry HTTP requests to use the SDK client instead. *(Requires: [P14-02]; Ensures the SDK's API contract is tested end-to-end)*
- [ ] **[P14-06]** Write SDK unit tests with a mocked HTTP layer covering: successful submission, retry on transient failure, buffer flush ordering after reconnect, and key rejection. *(Requires: [P14-02], [P14-03])*
- [ ] **[P14-07]** Write SDK integration tests against a running dev server via `docker-compose`. Use the flight path simulator from [P3-15] as the data source. These become the canonical end-to-end protocol conformance tests. *(Requires: [P14-05], [P3-15])*
- [ ] **[P14-08]** Publish the package to PyPI and tag the release. Document the installation method and the minimum API version the SDK requires. *(Requires: [P14-07])*
