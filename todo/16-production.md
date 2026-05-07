# Phase 16: Production Deployment

> **Requires:** Phase 4 complete ([P4-09] enforcement gate — auth must be on before any production exposure), Phase 15 complete (health endpoint needed for automated validation).
>
> Per the docs/E2E mandate in AGENTS.md, the production runbook ([P16-05]) and its automated validation test ([P16-06]) are a paired unit. Neither is complete without the other passing in CI.

- [ ] **[P16-01]** Create a production Docker Compose configuration with separate services: `nginx`, `daphne` (ASGI), and `db` (PostGIS). The `nginx` service must proxy both HTTP and WebSocket (`wss://`) traffic to `daphne`. *(Blocks: [P16-02], [P16-05])*
- [ ] **[P16-02]** Configure nginx for TLS termination. Document certificate provisioning (Let's Encrypt / Certbot recommended). Enforce HTTPS-only; reject plain `ws://` WebSocket connections. *(Requires: [P16-01])*
- [ ] **[P16-03]** Migrate secret management from `networkmonitor/secretkey.txt` to environment variables. Document every environment variable: name, purpose, example value, and whether it is required or optional with a safe default. *(Blocks: [P16-04])*
- [ ] **[P16-04]** Enable production Django security settings: `ALLOWED_HOSTS`, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_HSTS_SECONDS`. Verify these are absent from development config so they cannot be accidentally toggled in dev. *(Requires: [P16-03])*
- [ ] **[P16-05]** Write a production setup runbook at `docs/production-setup.md`: step-by-step from a fresh Linux server to a running, TLS-secured service. Each step must be a discrete, independently executable shell command so the automated validation in [P16-06] can run them verbatim. *(Requires: [P16-01], [P16-02], [P16-03], [P16-04]; Blocks: [P16-06], [P13-07])*
- [ ] **[P16-06]** Write an automated runbook validation CI job: provision a fresh Docker environment, execute the steps from `docs/production-setup.md` verbatim, and assert `GET /api/health/` returns `200`. If this job passes on CI, the runbook is confirmed correct. *(Requires: [P16-05], [P15-01]; Referenced by: [P13-07])*

## Database Backups

- [ ] **[P16-07]** Configure automated PostgreSQL backups: `pg_dump` on a daily schedule, encrypted and stored offsite (S3 or equivalent). Document the backup configuration and retention policy in the production runbook ([P16-05]). *(Blocks: [P16-08])*
- [ ] **[P16-08]** Write a backup restoration test: restore the most recent backup to a fresh database container and assert the schema and a sample of mission data are intact. Run this test quarterly and record the result in the ops log. Include the procedure in the production runbook.
