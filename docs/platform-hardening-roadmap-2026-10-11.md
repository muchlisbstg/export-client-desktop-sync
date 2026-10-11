# Desktop platform hardening roadmap

**Review date:** 2026-10-11  
**Status:** Planning document for review; not a production-readiness attestation.

## Current shape
- Electron + React renderer, restricted preload/IPC, Express API, and SQLite persistence.
- Local API defaults to loopback at port 4002; optional append-only peer replication to Web and Mobile.
- Electron Builder packaging is documented. Existing checks include `npm test`, `npm run typecheck`, `npm run build`, and packaging commands.

## Priority work

### P0 — Before real customer data
- Review Electron security settings: context isolation, sandboxing where compatible, disabled Node integration in renderer, strict preload API allowlist, navigation/window-open policy, and external URL handling.
- Enforce a restrictive Content Security Policy and audit every IPC handler for input validation and privilege boundaries.
- Design authentication/authorization for sensitive records; tracking codes must not substitute for access control.
- Require TLS for remote peer traffic; keep shared secrets out of renderer code, packaged resources, logs, and repository history.
- Define local database encryption/OS credential storage needs, data retention/deletion, backup/restore, and incident-response processes.
- Validate update provenance, package signing, and platform-specific distribution risks.

### P1 — Quality and security
- CI should run tests, typecheck, build, dependency/security scanning, and secret scanning.
- Add tests for renderer-to-main IPC authorization, malicious input, navigation restrictions, and external links.
- Test database durability after forced exit/restart, disk-full handling, peer timeouts, replay idempotency, and non-overwrite conflict behavior.
- Ensure diagnostics do not collect inquiry contact details or other unnecessary personal information.

### P2 — Release readiness
- Build and test installers on dedicated Windows, macOS, and Linux runners as supported; the host platform's packaging output is not proof that all target installers work.
- Protect signing/notarization credentials and require human approval for release publication.
- Document upgrade/rollback behavior, supported OS versions, and compatibility between Desktop, Web, and Mobile API contracts.
- Add an artifact provenance and release checklist. No installer is published by this document.

## Acceptance checklist
- [ ] Electron security configuration and IPC boundaries reviewed.
- [ ] Authentication/authorization and local-data handling are tested.
- [ ] Platform-specific package and update flows are verified.
- [ ] CI is green and release artifacts are reviewed.
- [ ] Human reviewer approves production use.

## Guardrail
This roadmap does not certify the application as secure or production-ready. Until the P0 items are implemented and verified, use synthetic/demo data only.
