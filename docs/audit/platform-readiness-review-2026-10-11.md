# Desktop platform readiness review — 2026-10-11

## Current scope
This repository contains an Electron + React desktop client with a local Express API and SQLite database. The local API should remain bound to loopback unless a reviewed deployment design explicitly requires otherwise.

## Readiness checklist
- [ ] Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`.
- [ ] Run packaging checks on each supported operating system; `npm run dist` on one host does not validate all platforms.
- [ ] Run interoperability tests against the matching Web and Mobile revisions.
- [ ] Review Electron security settings, preload/IPC allowlists, navigation, external links, dependency updates, and packaged application permissions.
- [ ] Keep peer secrets out of renderer code, logs, repository files, and packaged artifacts.
- [ ] Verify HTTPS/TLS for remote peers, backups, restore procedures, update/signing process, and a rollback plan.
- [ ] Define privacy, retention, incident response, and customer-support procedures before using real customer data.

## Synchronization risks
Replication is append-only and conflicting payloads are not automatically reconciled. Operators need a documented way to inspect durable conflicts and stalled outbox items without leaking customer data.

## Release gate
A local build or installer is not a security audit or production-readiness certification. Do not expose the HTTP API to untrusted networks or use real customer data until applicable controls have been reviewed and verified.
