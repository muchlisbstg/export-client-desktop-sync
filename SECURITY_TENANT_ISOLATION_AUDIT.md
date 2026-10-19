# Tenant isolation security review (2026-10-19)

## Verified implementation

- Supabase access tokens are verified server-side through `/auth/v1/user`; client-supplied role metadata is not used to grant admin.
- Admin access is currently an explicit user-ID allowlist (`ADMIN_USER_IDS`).
- The auth endpoints fail closed when provider configuration is missing or the identity provider is unavailable.
- Peer replication endpoints require a shared bearer secret and validate incoming record shape.

## Blocking gap: tenant ownership is not implemented

The current inquiry schema contains no `tenant_id`, `owner_user_id`, or equivalent ownership key. Inquiry creation and tracking are intentionally public RFQ/tracking flows; the session/admin endpoints do not scope inquiry reads or writes to a tenant. The desktop app stores records in a local SQLite database and has the same missing tenant ownership model.

Consequently, this repository must **not be represented as tenant-isolated** and should not handle real customer data for a multi-tenant deployment until ownership semantics and a migration are implemented. Merely checking a JWT or role is not tenant authorization.

## Required implementation before production

1. Define whether a tenant represents a buyer company, seller company, or workspace, and how a user can belong to multiple tenants.
2. Add a migration-safe tenant membership/ownership model, including a controlled migration plan for existing records (do not assign legacy records to an arbitrary tenant).
3. Require server-derived tenant membership for tenant-scoped list/read/update/delete routes; never accept a tenant ID from the request as proof of access.
4. Keep public RFQ submission and tracking as explicitly separate product flows; tracking must continue to return only minimal fields and use a high-entropy tracking code.
5. Enforce role permissions server-side, including admin operations and peer-sync trust boundaries.
6. Add positive and negative integration tests: same-tenant allowed; cross-tenant read/write denied; missing/expired token denied; customer cannot invoke admin actions; spoofed tenant ID ignored; legacy/unowned records inaccessible to tenant-scoped routes; sync peer unauthorized without the shared secret.
7. Verify all checks on the exact PR head SHA before manual review. Do not merge or deploy automatically.

## CI evidence

The CI workflow should be evaluated on the PR head SHA. Existing green runs on `main` do not validate a new branch. A green test suite does not by itself close the tenant-isolation gap above.
