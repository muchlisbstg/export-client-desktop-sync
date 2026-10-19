# Buyer/seller tenant isolation — implementation contract

## Approved model
- A tenant represents a buyer company or a seller company; tenant types are distinct and isolated.
- A user may belong to multiple tenants. The active tenant is only a selector; every request must revalidate the authenticated provider user ID against an active server-side `tenant_memberships` row.
- A client-supplied tenant ID or role is never proof of authorization.
- A buyer and seller may access a commercial transaction only when active membership in the corresponding buyer/seller tenant is verified and the transaction explicitly links those tenants.

## Migration and legacy safety
`scripts/migrate-tenant-isolation.mjs` adds tenant, membership, and commercial-transaction tables plus nullable buyer/seller tenant references on inquiries. It marks old records `unassigned` and never infers ownership from email, node ID, tracking code, or names.

Back up the database before running:
`node scripts/migrate-tenant-isolation.mjs <sqlite-db-path>`

Old records must remain inaccessible through tenant-scoped routes until an authorized owner verifies their ownership in an audited process. Never backfill arbitrary tenant IDs.

## Endpoint contract required before production
1. Authenticate bearer token server-side and derive immutable provider user ID.
2. Resolve active tenant from server-side membership; reject missing, suspended, revoked, or unknown membership.
3. Enforce buyer/seller tenant type and role on each read/write endpoint.
4. Scope list, detail, search, count, update, delete, export, attachment, and sync queries by authorized tenant or explicitly linked transaction.
5. Transaction access requires membership in the caller's tenant and matching buyer/seller tenant ID on the transaction.
6. Keep public RFQ creation/tracking explicitly separate; tracking exposes minimal fields only.
7. Peer sync must authenticate the peer and reject cross-tenant or unscoped records; a shared secret is not user membership.
8. Never trust client role metadata. Keep global admin separate, least-privilege, and audited.

## Required integration tests
- Same-tenant permitted read/write; cross-tenant read/update/delete denied.
- Buyer cannot use seller-only actions and vice versa.
- Missing/expired token, absent tenant context, suspended membership, and inactive tenant denied.
- Spoofed tenant ID/client role cannot grant access.
- Multi-tenant user can switch only to a tenant with active membership.
- Missing/invalid sync credentials denied; sync cannot inject cross-tenant records.
- Legacy unassigned rows stay inaccessible and are never silently assigned.
- Migration is idempotent, preserves legacy rows, and passes backup/restore rehearsal.

## Release gate
This schema migration is not proof of complete endpoint authorization. Production requires endpoint integration, the tests above, query-path review, and green CI on the exact PR head SHA. No automatic merge or deployment.
