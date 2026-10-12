# Route Access Policy (Review Proposal)

Status: **proposal for review; not implemented by this document**.

## Security principles

- Deny by default for any route not explicitly classified below.
- Keep browser, mobile, and packaged desktop clients public/untrusted. Never embed `SYNC_SHARED_SECRET`, service-role keys, signing keys, or other backend secrets in a client bundle.
- Enforce authentication and authorization on the server. A client-supplied role, tenant ID, owner ID, or user ID is not proof of permission.
- Resolve tenant membership from a verified identity and server-controlled membership data. Scope every private database query by the authenticated tenant/owner.
- Keep peer synchronization server-to-server and separate from end-user sessions.
- Return minimal data, use `Cache-Control: no-store` for inquiry-related responses, rate-limit public endpoints, and log security events without logging tokens or unnecessary personal data.

## Proposed access matrix

| Route category | Access | Required controls |
|---|---|---|
| Liveness | Public, minimal | Return only process health; no peer IDs, queue counts, secrets, or infrastructure details |
| Public active-product catalog | Public read | Return active public fields only; validate pagination/filter inputs if added |
| Create export inquiry / RFQ | Public write, if business confirms anonymous RFQs | Schema validation, rate limits, abuse protection, consent/privacy notice, idempotency strategy, retention policy |
| Tracking lookup | Public with high-entropy tracking code, pending product decision | Rate limits, no-store, minimal fields, anti-enumeration controls; consider email verification or a signed expiring link |
| Peer sync endpoint | Backend-to-backend only | Strong secret or mTLS, TLS outside loopback, secret rotation, peer allowlist, payload validation, replay/idempotency controls, rate limits and audit logs |
| Customer inquiry history / account APIs | Authenticated customer | Verified access token, owner/tenant scoping on every query, deny cross-tenant reads/writes |
| Operator/admin APIs | Authenticated privileged role | Server-side role checks, least privilege, audit trail, explicit admin-route allowlist, MFA through identity provider |
| Metrics/readiness/diagnostics | Private operator/monitoring access | Network restrictions and authentication; do not expose operational details publicly |

## Identity provider proposal

Supabase Auth is the current proposal for review, not a confirmed project decision. Before implementation, configure the real project issuer, expected audience, key/JWKS validation strategy, allowed algorithms, token expiry behavior, and account/tenant provisioning. Validate tokens on the backend using a maintained library; do not trust decoded-but-unverified JWT claims.

## Required negative tests before release

- Missing, malformed, expired, wrong-issuer, wrong-audience, and invalid-signature tokens are rejected on protected routes.
- Customer A cannot read, change, export, or delete Customer B's records.
- A regular customer cannot call operator/admin actions.
- Client bundles and build artifacts do not contain sync secrets or service-role credentials.
- Sync requests without valid backend credentials fail closed; invalid peer, malformed payload, replay/duplicate, and conflict cases are tested.
- Public tracking lookup is rate-limited and does not reveal unrelated personal data.
- Retention, deletion, backup/restore, incident response, TLS, secret rotation, and monitoring are documented and tested.

## Release gate

This document is a policy proposal only. It does not implement authentication, prove tenant isolation, or certify legal/regulatory compliance. Do not mark the service production-ready until the route inventory is verified against code, policy decisions are approved, enforcement and negative tests are implemented, and a human reviews the release.

## Desktop API inventory

**Audit pending:** this policy change does not assert a verified list of routes for the desktop backend. Before implementation, locate the current Express/API server entry point and enumerate every registered route and IPC handler. Apply the matrix to both HTTP routes and Electron IPC boundaries; the renderer process must be treated as untrusted, and privileged operations must stay in the main process or a protected local service.

Additional desktop controls:
- Bind local API services to loopback by default.
- Validate IPC sender/frame and validate every IPC payload.
- Do not expose privileged filesystem, database, shell, or sync operations directly to arbitrary renderer messages.
- Keep packaged app configuration free of reusable backend credentials.
- Test packaged installers and runtime permissions on each supported operating system.
