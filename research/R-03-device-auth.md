# R-03: Device Authentication Mechanism

> Research item [R-03] from `todo/00-research.md`. Blocks `[P4-05]` (Device
> Authentication) and `[P14-02]` (SDK `TelemetryClient`).

## Scope and constraints

The system ingests telemetry from UAV / ground-station devices over WiFi, LoRa,
Cellular, and Bluetooth links. The authentication mechanism for the device-facing
telemetry path (`POST /api/v1/telemetry/ingest/`, batched per `[P1-17]`) must satisfy:

1. **Retry-safe over unreliable RF links.** Links drop, buffer, and replay packets.
   Re-sending an identical request must not break authentication or corrupt state.
2. **No round-trip to authenticate a packet.** Each telemetry POST must be
   authenticatable statelessly or from edge-cached credentials — no token-exchange
   handshake, no challenge/response.
3. **Pre-provisioning before field deployment.** Devices are credentialed at a
   workbench; there is no interactive login flow in the field.
4. **Manageable revocation / rotation.** A lost or compromised device must be
   cuttable off quickly, and routine key rotation must not require a field visit.
5. **Low implementation complexity** in Django + DRF and in a pure-Python device SDK
   (`network-monitor-client`, Phase 14).

Note on terminology: the *device* auth path is entirely separate from the *user*
auth path. Users authenticate with `djangorestframework-simplejwt` (`[P4-01]`);
WebSocket clients use a `?token=` query param (`[P4-10]`). Devices never receive a
JWT — they are non-interactive, long-lived field assets and need a credential model
built for that.

---

## Options evaluated

### Option A — Pre-shared API keys (rotatable, per-device)

Each `Device` is issued a long random secret at registration. The device stores it
and sends it on every telemetry POST in an `Authorization: Api-Key <key>` header.
The server hashes the presented key and looks up the matching `Device`.

**Mechanics**
- Key = high-entropy random token (e.g. 32 bytes, URL-safe base64). A short
  non-secret `key_id` / prefix is stored in cleartext so lookups are indexed and
  do not require scanning every row.
- Server stores **only a hash** of the secret (`django.contrib.auth.hashers` or a
  fast keyed hash — see below), never the plaintext. Plaintext is shown exactly
  once, at creation, then is non-recoverable (matches `[P4-05]`).
- Validation is a single indexed lookup by `key_id` + a constant-time hash compare.
  Stateless from the device's perspective; one cheap DB read on the server.

**Retry-safety:** Excellent. The credential is a static bearer string. Re-sending
the same POST presents the same key and authenticates identically every time.
Authentication carries no nonce, no counter, no timestamp — nothing that a replayed
packet can invalidate.

**Round-trip:** None. The key travels with the request.

**Pre-provisioning:** Trivial. Create the `Device` row in Django Admin, copy the
one-time-shown key onto the device image / config file at the workbench.

**Revocation/rotation:** Simple. Revoke = set `revoked_at` / `is_active = False`.
Rotate = issue a new key, optionally with an overlap window where both old and new
keys are valid (see lifecycle section). Per-device, so blast radius of one
compromised device is one device.

**Implementation complexity:** Lowest. DRF supports this directly with a custom
`BaseAuthentication` class (~30 lines). The mature `djangorestframework-api-key`
package implements exactly this pattern (prefix + hashed secret, admin integration)
and could be adopted instead of hand-rolling. SDK side is one header — a few lines.

**Weaknesses:** It is a bearer token. Anyone who captures it in transit can replay
it. **This is acceptable only if the transport is TLS** (HTTPS to the ingest
endpoint). Over a raw/unencrypted RF link the key would be exposed; the assumption
here is that the device reaches the backend over HTTPS (the LoRa/BT/cellular hop
terminates at a gateway that forwards over IP). It does not provide per-message
integrity — a man-in-the-middle on a non-TLS segment could alter the body.

### Option B — HMAC-signed requests

Each device holds a shared secret. For every request the device computes
`HMAC-SHA256(secret, canonical_request)` over a canonical string (method, path,
body hash, a timestamp, and a nonce) and sends the signature plus `key_id`,
`timestamp`, and `nonce` in headers. The server recomputes the HMAC with the
stored secret and compares.

**Mechanics**
- The secret is provisioned exactly like an API key (random, hashed-at-rest is
  *not* possible here — see weakness below).
- The signed canonical request includes a SHA-256 of the body, so HMAC provides
  **per-message integrity**, not just authentication.
- Replay protection is the explicit job of the `timestamp` + `nonce`: the server
  rejects requests outside a time window and rejects nonces it has already seen.

**Retry-safety:** **This is the core problem.** Replay protection and retry-safety
are in direct tension. To stop an attacker replaying a captured packet, the server
must reject duplicate `(key_id, nonce)` pairs or stale timestamps. But over an
unreliable RF link the *device's own* legitimate retry is byte-identical to a
replay — same nonce, same timestamp, same signature. The server cannot tell a
benign retry from a malicious replay.

Workarounds all add cost or weaken the property:
- *Fresh nonce/timestamp per retry attempt* → each retry is a different signed
  request. But the device often retries precisely because it never learned whether
  the first attempt landed; now two non-identical requests may both arrive,
  producing duplicate snapshots. This pushes idempotency into the application layer
  anyway (see "Cross-cutting" below) — at which point HMAC's replay window adds no
  safety the idempotency key doesn't already provide.
- *Wide time window, no nonce cache* → no real replay protection; reduces HMAC to a
  heavier API key.
- *Nonce cache keyed to a client-stable idempotency key* → workable, but it means
  the server keeps replay state, partially defeating the "stateless auth" goal, and
  the nonce store must outlive the longest possible buffered-then-flushed delay
  (`[P14-03]` buffers offline snapshots, possibly for hours).

**Round-trip:** None for auth itself. But a strict timestamp window interacts badly
with offline buffering: a snapshot captured offline and flushed hours later
(`[P14-03]` preserves the original `captured_at`) would fall outside any sane
*request-time* window. The signature must therefore be computed at *send* time, not
*capture* time — meaning the device re-signs every buffered item on flush. Doable,
but more SDK logic.

**Pre-provisioning:** Same as API keys — provision a secret at the workbench.

**Revocation/rotation:** Same as API keys (revoke/rotate the secret). No worse, no
better.

**Implementation complexity:** Highest of the three for what it delivers. Requires:
a precisely specified, versioned canonical-request format that the Django side and
the Python SDK must implement *identically* (any divergence in header casing, path
normalisation, or body encoding silently breaks every request); clock-skew
handling; and a nonce store with TTL. The server also cannot store the secret
hashed — it needs the plaintext secret to recompute the HMAC — so the secret sits
in the database in a recoverable form (encrypted-at-rest at best), a strictly worse
posture than the hashed API key. Clock skew on a field device with no NTP is a real
operational failure mode.

**Where HMAC genuinely wins:** per-message body integrity over an untrusted
transport. If telemetry traversed a segment where TLS could not be guaranteed
end-to-end, HMAC over the body would detect tampering. With HTTPS to the ingest
endpoint, TLS already provides transport integrity, so this advantage is largely
redundant here.

### Option C — Device certificates (mTLS)

Each device is provisioned with an X.509 client certificate and private key. The
TLS handshake itself authenticates the device: the terminating server (or a reverse
proxy / load balancer) verifies the client cert against a trusted CA and passes the
verified identity to Django.

**Retry-safety:** Excellent. Identity is established by the TLS handshake; the HTTP
request body carries no auth material at all, so a re-sent request is trivially
safe. Best-in-class on this axis.

**Round-trip:** The *TLS handshake* is a round-trip, but it is amortised across a
persistent connection — it is not per-telemetry-packet. With HTTP keep-alive, one
handshake covers many POSTs. On a link that drops constantly, though, the
connection is re-established frequently, so the (more expensive) mTLS handshake
recurs more often than with a plain bearer token over a resumed TLS session. On
high-latency LoRa-class links, full handshakes are a real cost.

**Pre-provisioning:** Possible but heaviest. The workbench step must generate a
keypair, produce a CSR, get it signed by the CA, and install the cert + key + CA
chain onto the device. This presupposes a **PKI exists** — a CA, a signing process,
and a way to publish revocation. Standing up and operating a PKI is a project in
itself.

**Revocation/rotation:** The hardest part. Revocation needs either a CRL or an OCSP
responder, both of which the verifying endpoint must consult — reintroducing
infrastructure and, for OCSP, a round-trip. Short-lived certs (auto-renewed) avoid
CRLs but require a renewal channel to reach field devices, which the unreliable-RF
constraint makes unreliable. Certs also expire; an expired cert on a deployed UAV
is a silent outage unless renewal is solved.

**Implementation complexity:** Highest overall. mTLS is typically terminated at the
proxy/ingress (Daphne is the ASGI server here, usually behind nginx/a load
balancer), so the design spans infrastructure, not just Django. The Django side
must trust a proxy-injected verified-DN header, which must be spoof-proofed. The
Python SDK must ship and rotate a private key and present a client cert — `requests`
/ `httpx` support this, but key handling, file permissions, and renewal are real
SDK surface area.

**Where mTLS genuinely wins:** strongest cryptographic identity, no shared secret
on the server side (the server stores only the CA, not per-device secrets), and it
is the right answer at large device counts (thousands+) where an organisation
likely already runs a PKI / device-identity service.

---

## Comparison table

| Criterion | A. Pre-shared API keys | B. HMAC-signed requests | C. Device certs (mTLS) |
|---|---|---|---|
| Retry-safe over RF | Excellent — static bearer, identical every send | Poor — replay protection fights legitimate retries | Excellent — auth is in the handshake, not the body |
| No per-packet round-trip | Yes | Yes (but strict timestamps clash with offline-buffer flush) | Handshake amortised over keep-alive; recurs on every reconnect |
| Pre-provisioning | Trivial — copy one string at workbench | Trivial — copy one secret | Heavy — needs keypair + CSR + CA signing |
| Revocation | Simple — `is_active` flag | Simple — flag the secret | Hard — CRL/OCSP or short-lived certs + renewal channel |
| Rotation | Simple — overlap window of two keys | Simple — overlap window of two secrets | Re-issue cert; needs working renewal path to the field |
| Secret at rest (server) | Hashed — non-recoverable | Recoverable (plaintext/encrypted) — needed to recompute HMAC | No per-device secret — server holds only the CA |
| Per-message body integrity | No (relies on TLS) | Yes | No (relies on TLS) |
| Django implementation effort | Low — custom DRF authenticator (~30 LOC) or `drf-api-key` | High — versioned canonical format + nonce store + skew handling | High — proxy mTLS termination + trusted-header plumbing |
| Python SDK effort | Low — one header | Medium — canonical signing must exactly match server | Medium — key/cert files, permissions, renewal |
| Needs extra infrastructure | No | Nonce/replay cache (Redis already present) | Yes — a PKI (CA, signing, CRL/OCSP) |
| Good fit at scale | Up to low thousands of devices | Same as A, no real gain | Best at thousands+ with an existing PKI |

---

## Recommendation

**Adopt Option A — pre-shared, per-device, rotatable API keys**, transported over
HTTPS, with application-level idempotency on the ingest endpoint.

Reasoning:

1. **Retry-safety is the hardest requirement and a static bearer key passes it
   cleanly.** HMAC's replay protection is fundamentally at odds with retry-safety on
   a lossy link; mTLS passes but at a large infrastructure cost.
2. **The two security advantages of B and C are redundant here.** HMAC body
   integrity and mTLS transport identity are both subsumed by running the ingest
   endpoint over HTTPS, which the project should do regardless. Paying B's or C's
   complexity to re-acquire a property TLS already gives is poor value.
3. **It is the only option that lets the server store the credential hashed and
   non-recoverable**, which `[P4-05]` explicitly mandates ("Keys are non-recoverable
   after creation").
4. **Lowest implementation cost** in both Django (a small DRF `BaseAuthentication`,
   or adopt `djangorestframework-api-key`) and the SDK (one header), matching the
   project's "surgical, low-complexity" engineering standard.
5. **Revocation and rotation are simple** and require no field visit and no extra
   infrastructure.

Replay protection — the one thing a raw bearer key lacks — is **delegated to an
application-level idempotency key** rather than to the auth layer, because the
ingest path needs idempotency anyway: `[P14-03]` flushes a device's offline buffer
in batches and a half-delivered batch will be re-sent. See "Cross-cutting" below.

**Revisit the decision and move to mTLS (Option C) if** the deployment grows past
~1–2k devices, *or* if an organisational PKI / device-identity service already
exists and is mandated, *or* if a regulatory requirement demands cryptographic
device identity that a revocable shared secret cannot satisfy. These are flagged as
open questions.

### Cross-cutting: idempotency (independent of the auth choice)

Whichever auth mechanism is chosen, the ingest endpoint must be idempotent so a
retried POST does not create duplicate snapshots. Recommended:

- The SDK generates a stable **idempotency key per snapshot** (a UUID minted at
  *capture* time, stored alongside the buffered snapshot so it survives the
  offline-buffer flush in `[P14-03]`).
- The key is sent as a header (`Idempotency-Key`) or as a per-snapshot field in the
  batch body.
- The server records processed keys (a uniqueness constraint on the snapshot row,
  or a short-TTL set in the already-present Redis) and on a duplicate returns
  `200 OK` with the original result instead of inserting again.

This makes retries safe at the application layer, where the property belongs, and
means the auth layer does not have to carry replay state. It is the reason HMAC's
nonce machinery buys nothing extra: the idempotency key already does that job, and
does it correctly across the offline-buffer-flush case.

---

## Proposed device registration flow

Provisioning happens at a workbench before deployment. There is no field
enrolment.

1. **Create the device record.** An operator opens Django Admin (`[P4-07]` adds the
   UI) and creates a `Device`: human-readable name, owning team/mission, optional
   hardware identifier, `is_active = True`.
2. **Generate the key — server-side.** On save, the server generates a fresh
   secret: a short non-secret `key_id` prefix (e.g. 8 chars, stored in cleartext
   and indexed) plus a high-entropy secret (≥32 bytes, `secrets.token_urlsafe`).
   It stores **only the hash** of the secret. The full key shown to the operator is
   `"<key_id>.<secret>"`.
3. **Display the key exactly once.** The Admin shows the full key on the creation
   response screen with a clear "copy this now — it cannot be retrieved later"
   warning. It is never stored or shown again (`[P4-05]`).
4. **Install onto the device.** The operator places the key into the device's
   config — a file with restrictive permissions, an OS keystore, or a build-time
   secret in the device image. The SDK reads it from there; the key is never
   embedded in source.
5. **Verify connectivity.** Before the device leaves the bench, run a test
   telemetry POST (the SDK's `TelemetryClient`, `[P14-02]`) and confirm a `201`.
   This catches a mistyped key while it is still cheap to fix.
6. **Deploy.** The device goes to the field already credentialed; it authenticates
   every telemetry POST with the stored key — no login, no handshake.

**On the wire:** `Authorization: Api-Key <key_id>.<secret>` (HTTPS). The server's
DRF authenticator splits on `.`, looks the `Device` up by indexed `key_id`,
constant-time-compares the hash, and rejects with a structured `401` if absent,
unknown, inactive, or expired (`[P4-06]`, `[P4-08]`).

---

## Key/certificate lifecycle

### Generation
- Keys are generated server-side only, on `Device` creation, with a CSPRNG
  (`secrets`). Devices never choose their own key.
- At rest the server keeps only `key_id` (cleartext, indexed) + a hash of the
  secret. A leak of the database does not leak usable device keys.

### Rotation (routine, no compromise)
The `Device` model supports **two concurrently-valid keys** to allow zero-downtime
rotation over an unreliable link:

1. Operator triggers "rotate" in Admin. The server generates `key_new`, keeps
   `key_old` valid, and records a `previous_key_expires_at` (an overlap window —
   e.g. 7–30 days, long enough to cover a device that is offline / buffering).
2. The new key is delivered to the device. Because field re-provisioning may not be
   possible, the practical paths are: (a) a workbench refresh during scheduled
   maintenance, or (b) an authenticated `GET`/`POST` "fetch my next key" endpoint
   the device calls with its *current* key — the device pulls its replacement,
   confirms receipt, then switches. Whether (b) is in scope is an open question.
3. Once the device confirms it is using `key_new` (or the overlap window lapses),
   `key_old` is dropped. `[P4-08]` requires a test proving rotation invalidates the
   old key.
4. Recommend a default rotation cadence (e.g. annually) plus rotation on any
   operator role change or suspected exposure.

### Revocation (device lost or compromised)
- Immediate: operator sets `is_active = False` (or `revoked_at = now()`) in Admin.
  The next telemetry POST from that device is rejected with a structured `401`.
- Revocation is per-device — blast radius is exactly one device; no other device's
  key changes.
- Because auth is a per-request DB lookup, revocation takes effect on the *next*
  request with no propagation delay. If key lookups are cached in Redis for
  performance, the cache entry must be invalidated on revoke (short TTL, e.g. 60s,
  bounds the worst case).
- Audit: log every auth failure and every revocation. Phase 11 (`[P11]`) audit
  logging should capture device-auth events — invalid-key attempts after a
  revocation are a useful compromise signal.

### Expiry
- Optional `expires_at` on a key. A device whose key expires is rejected like an
  invalid key (`[P4-08]` tests expired-key rejection). Use expiry as a backstop
  forcing rotation; keep windows generous so a long offline-buffering device
  (`[P14-03]`) is not locked out mid-mission.

### What the SDK does
- Reads the key from device config; sends it on every request.
- On `401`, surfaces a clear, distinct error (not a generic transient failure) so
  it is **not** retried with back-off — a rejected key will never succeed by
  retrying, and `[P14-06]` tests key-rejection handling.
- If the optional pull-based rotation endpoint is adopted, the SDK checks for and
  adopts a new key on a schedule, keeping the old one until the new one succeeds.

---

## Owner responses — 2026-05-18

1. **Device count:** Typical deployment is ≤10 nodes; ≤100 is rare. API keys are well within this scale. mTLS is not needed.
2. **PKI:** Exists for UAVs but not other infrastructure. Avoid PKI for the service — would complicate offering this as a managed/hosted service. API keys confirmed.
3. **Non-IP link topology:** Devices with non-IP links (LoRa, Bluetooth) **always have a working IP link as well**. Non-IP links are used only for (a) locating aircraft after landing/crash and (b) emergency C&C. Non-critical data on non-IP links is stored or dropped. All telemetry arrives over IP; HMAC for non-IP hops is therefore out of scope.
4. **Package:** Use `djangorestframework-api-key` — prefer existing well-maintained projects over hand-rolling.

Remaining open (not blocking [P4-05]):
- Pull-based rotation scope (Q4) — decide at [P4-07].
- Offline buffer overlap window (Q5) — decide at [P14-03].
- Rotation cadence / expiry policy (Q7) — decide at [P4-07].

**Decision: Pre-shared API keys via `djangorestframework-api-key`. [R-03] closed.**

---

## Open questions

Decisions the project owner needs to make:

1. **Expected device count and growth.** The API-key recommendation holds well into
   the low thousands. If the fleet is expected to reach many thousands, or to be
   multi-tenant at scale, re-evaluate mTLS (Option C) now to avoid a later
   migration.
2. **Is there an existing PKI / device-identity service?** If the deploying
   organisation already runs a CA and device-identity tooling, mTLS becomes much
   cheaper and may be the better strategic choice. If not, standing one up solely
   for this is not justified.
3. **TLS termination topology.** The recommendation assumes the device reaches the
   ingest endpoint over HTTPS. Confirm: is TLS terminated end-to-end at Daphne, or
   at a reverse proxy / load balancer? For LoRa/Bluetooth devices, where does the RF
   hop terminate and become IP traffic, and is that whole path inside trust
   boundaries? If any segment carrying telemetry is *not* TLS-protected, HMAC body
   signing (Option B) becomes relevant again.
4. **Pull-based key rotation in scope?** Should the device be able to fetch its next
   key over the network (authenticated with its current key), or is key delivery
   always a workbench operation? This decides whether `[P4-05]`/`[P4-07]` need a
   rotation endpoint or only Admin-side rotation.
5. **Overlap window length.** How long can a device be offline/buffering? The
   old-key overlap window and any `expires_at` must exceed the longest realistic
   offline period so `[P14-03]` buffer flushes are never rejected.
6. **Build vs. adopt `djangorestframework-api-key`.** The package implements the
   recommended prefix + hashed-secret pattern with Admin integration. Adopting it
   reduces `[P4-05]`/`[P4-06]` to configuration; hand-rolling keeps zero new
   dependencies but adds ~50–80 LOC to own and test. Recommend adopting the package
   unless dependency minimalism is a hard constraint.
7. **Rotation cadence and expiry policy.** Confirm a default routine rotation period
   and whether keys carry a hard `expires_at` or rotate only on operator action.
