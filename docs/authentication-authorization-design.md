# Authentication and Authorization Design (Proposed)

Status: design proposal only. This document does not mean authentication or authorization is implemented.

## Security boundary

Keep three identities separate:

1. **End user** — a customer, seller, or staff member using the product.
2. **Administrator/operator** — a staff identity with explicitly assigned permissions.
3. **Sync node** — a backend service identity used only for server-to-server replication.

The existing `SYNC_SHARED_SECRET` is for sync nodes only. Never embed it in a browser bundle, mobile app, Electron renderer/preload, or any other distributed client.

## Proposed rollout

### Phase 0 — Define product policy

- Decide whether public users may submit RFQs without an account.
- Define roles and permissions (customer, seller/operator, administrator) and whether records belong to a tenant/company.
- Define who may view an inquiry, update its status, export it, or delete it.
- Document retention periods, deletion/correction requests, and audit-log retention before storing real personal data.

### Phase 1 — Server-side identity

- Use a maintained identity provider or a separately reviewed server-side authentication module; do not invent password hashing, token signing, or account recovery.
- Validate issuer, audience, expiry, signature, and allowed algorithms for every access token. Reject missing, malformed, expired, or incorrectly scoped credentials.
- Use short-lived access tokens and a reviewed refresh/session strategy. For browser sessions, prefer secure, HttpOnly, SameSite cookies with CSRF protection when cookie-based authentication is selected.
- Store only a stable subject identifier and required authorization metadata. Never log bearer tokens, passwords, or raw authorization headers.

### Phase 2 — Authorization at every private route

- Create centralized middleware/policy helpers; deny by default.
- Public routes are an explicit allowlist: health, active product catalog, RFQ submission only if product policy permits, and limited tracking lookup by high-entropy tracking code.
- Require authenticated and authorized roles for private inquiry details, status changes, exports, admin/catalog management, and audit data.
- Enforce record ownership/tenant scope in the database query itself; do not rely only on hiding UI controls.
- Keep `POST /api/v1/sync/inquiries` isolated as service-to-service authentication. Do not accept an end-user token as a sync credential or let the sync secret grant admin access.
- Return minimal error details and set `Cache-Control: no-store` on responses containing user-specific data.

### Phase 3 — Platform-specific handling

- **Web:** keep provider secrets on the server; avoid persistent browser storage for long-lived bearer tokens; protect cookie sessions against CSRF and validate origins.
- **Mobile:** use the system secure credential store for session credentials; do not package API signing secrets in the app. Treat device storage as untrusted and support logout/revocation.
- **Desktop:** keep credentials out of renderer local storage and logs; use the OS credential store where appropriate; keep Electron context isolation enabled, Node integration disabled in renderer, and expose only narrow validated IPC methods.

### Phase 4 — Required security tests

- Missing, malformed, expired, wrong-issuer, wrong-audience, and revoked credentials are rejected.
- Authenticated user A cannot read, modify, export, or delete user B's records or another tenant's records.
- Non-admin cannot invoke admin endpoints; changing client-side role fields has no effect.
- Public routes return only documented fields; tracking codes are rate-limited and treated as bearer credentials.
- Missing/invalid sync secret is rejected; sync secret is absent from built web assets, mobile bundles, desktop renderer/preload, logs, and crash reports.
- Tests cover CORS/CSRF where relevant, rate-limit behavior behind the real proxy, session revocation, and audit events without sensitive payloads.

## Release gate

Do not enable production access to real customer data until identity-provider configuration, role/tenant policy, data retention, migration/backfill, threat review, automated tests, and a human security review are complete. Run CI and inspect the exact commit after any implementation. This proposal is not a compliance certification.
