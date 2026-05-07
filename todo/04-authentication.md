# Phase 4: Authentication

> **Requires:** Phase 3 complete.
>
> **Prototype note:** The system continues to function without authentication during this phase. Auth is additive — unauthenticated access is progressively restricted as each task is completed. Full enforcement ([P4-09]) is required before Phase 5 (Scaling) may begin.

## User Authentication

- [ ] **[P4-01]** Add `djangorestframework-simplejwt` to `requirements.txt`. Configure DRF to use JWT authentication with session fallback for the Django Admin interface. *(Blocks: [P4-02], [P4-10])*
- [ ] **[P4-02]** Implement login/logout API endpoints. Apply `IsAuthenticated` to all data-write endpoints; read endpoints remain open until [P4-09]. *(Requires: [P4-01])*
- [ ] **[P4-03]** Add frontend login screen and JWT token management. Store tokens in memory only — never in `localStorage` or `sessionStorage`. *(Requires: [P4-02])*
- [ ] **[P4-04]** Write integration tests for the full authentication flow: login, token refresh, and logout. *(Requires: [P4-02])*

## WebSocket Authentication

- [ ] **[P4-10]** Implement JWT validation in the WebSocket consumer `connect()` method. Clients pass the access token as a query parameter (`?token=`) during the WebSocket handshake; the consumer validates it and closes the connection with code 4001 if absent or invalid. *(Requires: [P4-01]; Blocks: [P4-11])*
- [ ] **[P4-11]** Write tests asserting: authenticated WS connections are accepted, unauthenticated connections are closed with code 4001, and expired tokens cause disconnection on the next keepalive check. *(Requires: [P4-10])*

## Device Authentication

> **Requires:** Research item [R-03] recorded in `todo/00-research.md`.

- [ ] **[P4-05]** Implement `Device` model with API key field using the mechanism chosen in [R-03]. Keys are non-recoverable after creation; implement secure generation and storage. Generate and apply migration. *(Requires: [R-03]; Blocks: [P4-06], [P4-07], [P14-02])*
- [ ] **[P4-06]** Add device authentication middleware validating the key on all inbound telemetry endpoints. Unauthenticated telemetry is rejected with a clear error. *(Requires: [P4-05])*
- [ ] **[P4-07]** Implement device registration and key-rotation UI in Django Admin. *(Requires: [P4-05])*
- [ ] **[P4-08]** Write tests for: valid key acceptance, invalid key rejection, expired key rejection, and key rotation invalidating the previous key. *(Requires: [P4-06])*

## Enforcement Gate

- [ ] **[P4-09]** Enable `IsAuthenticated` on all remaining read endpoints. Audit every URL pattern to confirm no unauthenticated path to data remains. This task must be marked complete before Phase 5 begins. *(Requires: [P4-02], [P4-06], [P4-10]; Blocks: Phase 5)*
