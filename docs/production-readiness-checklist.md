# Production Readiness Checklist — Export Client Desktop

This repository is an MVP/demo. A green CI run does not establish production readiness. Do not use real customer data until every applicable item is implemented, tested, reviewed, and approved.

## P0 — Access control and data protection

- [ ] Define user identity, roles, tenant boundaries, and admin permissions.
- [ ] Enforce authentication and authorization on every non-public API; do not treat a tracking code as sufficient authorization for internal or customer-private data.
- [ ] Decide whether public tracking remains anonymous; minimize fields returned and add abuse monitoring/rate limits.
- [ ] Define lawful purpose, retention period, export, correction, and deletion for names/emails and sync conflict records.
- [ ] Confirm SQLite files, backups, logs, crash reports, and packaged app storage do not expose customer PII; document encryption and key management where required.

## P0 — Network and peer synchronization

- [ ] Keep desktop API bound to loopback unless a reviewed deployment explicitly requires another interface.
- [ ] Use HTTPS/TLS for every non-loopback peer; firewall peers to the minimum required endpoints and hosts.
- [ ] Store peer secrets in server-side secret management; rotate credentials and never ship shared peer secrets inside desktop/mobile client bundles.
- [ ] Verify peer identity and secret rotation/revocation procedures; add tests for missing, invalid, expired/rotated credentials and unauthorized access.
- [ ] Test retry storms, peer outage/recovery, duplicate replay, conflicting IDs/tracking codes, and durable outbox recovery after restart.

## P1 — Reliability and operations

- [ ] Define backup frequency, encrypted off-host storage, restore drills, RPO/RTO, and SQLite integrity checks.
- [ ] Add structured, redacted logs and monitoring for API errors, sync backlog, retry age, conflict counts, disk space, and process health.
- [ ] Add migration/rollback checks and verify persistence paths for each supported operating system.
- [ ] Test packaged installers and upgrades on supported Windows/macOS/Linux versions; sign artifacts where appropriate and publish checksums.
- [ ] Run dependency, secret, static-analysis, and vulnerability checks in CI; review findings rather than relying on green build status alone.

## Release gates

- [ ] All automated tests, type checks, build, dependency/security checks, and cross-platform interoperability tests pass.
- [ ] Staging smoke tests and backup/restore drill pass with synthetic data.
- [ ] Security/privacy review is recorded and blockers are resolved.
- [ ] A human owner approves the exact artifact/commit for release.
- [ ] Rollback and post-release verification steps are documented.

No production deployment is authorized by this checklist or pull request.
