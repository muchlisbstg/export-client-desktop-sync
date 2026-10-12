# Authentication Provider Decision Record

Status: recommendation for review; not an implementation or production approval.

## Recommendation

Use **Supabase Auth as the initial identity provider**, subject to product-owner confirmation. Keep authorization and tenant ownership enforcement in each trusted backend; do not treat client-side UI state or user-supplied role fields as permissions.

## Why this is the default proposal

- One identity system can support the Web, React Native, and Electron clients.
- Avoids implementing password storage, credential recovery, and token issuance from scratch.
- Supports a staged rollout while each backend remains responsible for enforcing its own access policy.

## Required server-side validation

Before enabling private routes, each backend must validate access tokens using the provider's supported verification approach and configured project issuer/audience. Reject invalid signature, issuer, audience, expiry, or malformed claims. Map the stable authenticated subject to server-controlled user/tenant membership. Never trust role or tenant identifiers supplied only by the client.

Do not expose service-role keys or other privileged provider secrets in browser assets, mobile bundles, Electron renderer/preload, or public environment variables. The existing `SYNC_SHARED_SECRET` remains exclusively for backend-to-backend synchronization and must not be used as a user login credential.

## Initial route policy proposal

- Public, subject to rate limiting: health, active product catalog, RFQ submission, and tracking by high-entropy tracking code.
- Authenticated and ownership-scoped: private inquiry details, inquiry updates, saved records, and exports.
- Admin/operator: explicit server-assigned permissions; deny by default and audit sensitive actions.
- Sync endpoint: service-to-service secret only, independent from end-user sessions.

The public RFQ policy, role definitions, tenant model, data retention period, and whether sellers/operators need separate permissions must be confirmed before implementation.

## Rollout gates

1. Confirm provider and project environment; no production credentials in source control.
2. Define public route policy, roles, tenant membership, and record ownership.
3. Implement backend token validation and centralized authorization independently in each API.
4. Add tests for missing/expired/invalid tokens, issuer/audience failures, user-to-user and tenant isolation, non-admin denial, sync-secret isolation, and rate limits.
5. Run all CI and interoperability suites; review the exact commits.
6. Complete privacy/retention and human security review before production data.

This recommendation is not evidence that authentication is implemented, that the system is production-ready, or that any compliance certification exists.
