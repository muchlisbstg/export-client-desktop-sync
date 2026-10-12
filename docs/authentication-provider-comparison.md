# Authentication provider comparison

Status: proposal for review. This PR does not provision a Supabase project or configure production credentials.

## Recommendation

Use Supabase Auth for the initial pilot behind a server-side authorization boundary. Keep the provider adapter small so it can be replaced later. This is a recommendation, not a production provider approval.

| Dimension | Supabase Auth | Self-hosted authentication |
|---|---|---|
| Time to deliver | Faster: managed identity, password flow and recovery | Slower: implement signup, recovery, verification, sessions and abuse controls |
| Security operations | Provider handles identity infrastructure; application still owns authorization | Team owns patching, signing-key rotation, session revocation, MFA/recovery and incident response |
| Roles and tenants | Store admin and tenant membership in server-controlled records/config; do not trust user metadata | Full control, but team must design and audit schema and workflows |
| Portability | Coupled to Supabase endpoints and token format | Can be portable with a maintained standards-based identity server |
| Cost | Lower initial engineering cost; usage limits and plan pricing apply | Infrastructure may be cheaper, but engineering/on-call cost is significant |
| Best fit | MVP and early enterprise pilot | Teams with proven identity/security operations or hard self-hosting requirements |

## Security contract

- Backend validates bearer access tokens by calling Supabase Auth `/auth/v1/user`; provider outages fail closed.
- Backend configuration: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_USER_IDS`.
- Client configuration may contain only the public anon/publishable key, never a service-role key, database password, or `SYNC_SHARED_SECRET`.
- Admin role comes only from the server-side `ADMIN_USER_IDS` allowlist of verified user IDs. Client metadata and request bodies cannot grant admin.
- `GET /api/v1/auth/session` exposes the verified identity; `GET /api/v1/admin/session` is admin-only.
- Existing catalog/RFQ/tracking endpoints remain public by current product design. Tracking code remains a bearer capability. Customer-owned records and tenant isolation require a reviewed tenant-membership data model before private inquiry endpoints are added.
- Peer sync remains a separate server-to-server boundary using `SYNC_SHARED_SECRET`.

## Client environment

- Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Mobile: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Desktop renderer: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Release gates

1. Configure Supabase project, redirect URLs, password/recovery policy, MFA decision, and provider rate limits.
2. Populate admin IDs via reviewed server environment settings; never commit real IDs or secrets.
3. Define authoritative tenant membership before exposing tenant-scoped inquiry access.
4. Test missing, expired, revoked and wrong-project tokens; non-admin denial; tenant isolation; sync-secret isolation; abuse limits.
5. Review retention/deletion, audit logs, TLS, backups/restore, monitoring and platform packaging.
6. Review CI and all three PRs. No merge or deployment is performed here.
