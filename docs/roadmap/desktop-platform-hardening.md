# Desktop platform hardening roadmap

Status: planning document for the existing Electron MVP. This is not a statement of production readiness.

## Current boundary
- Electron + React desktop client with a local Express API and SQLite storage.
- The client uses a restricted preload/IPC path for required network operations.
- Optional peer sync is append-only; current API transport is HTTP locally.
- The current README says login, admin authorization, retention policy, and production backend controls are incomplete.

## Priority 0 — before real customer data
- [ ] Keep Electron renderer isolation enabled; verify context isolation, sandboxing where compatible, and a minimal preload API.
- [ ] Apply a strict Content Security Policy and deny unexpected navigation, popups, and untrusted external URLs.
- [ ] Validate every IPC input and enforce an allowlist of operations; never expose raw filesystem, shell, or unrestricted network APIs.
- [ ] Implement server-side authentication and tenant/role authorization for API operations.
- [ ] Require TLS for remote API/peer traffic and keep sync secrets outside renderer and packaged client assets.
- [ ] Define local database encryption needs, device access controls, retention, export, and secure deletion policy.
- [ ] Document backup/restore and migration behavior for the userData SQLite database.

## Priority 1 — packaging and supportability
- [ ] Build and test separate Windows, macOS, and Linux artifacts on matching runners.
- [ ] Sign/notarize platform packages where supported; document unsigned developer builds distinctly.
- [ ] Define update channel, update signature verification, rollback, and release notes.
- [ ] Add crash reporting only after privacy review and redaction controls.
- [ ] Test clean install, upgrade, downgrade/rollback, offline startup, corrupt database recovery, and uninstall behavior.
- [ ] Add accessibility and keyboard-navigation checks to core RFQ flows.

## Priority 2 — delivery
- [ ] Keep CI permissions least-privilege; add dependency and secret scanning.
- [ ] Publish immutable artifacts and checksums; include an SBOM when feasible.
- [ ] Run smoke tests against the packaged app, not only the renderer build.
- [ ] Require human approval before production distribution and maintain a rollback runbook.

## Release gates
Do not use real customer records until IPC/security review, authentication/authorization, privacy and retention decisions, TLS for remote traffic, and database recovery tests are complete. A successful Electron build does not by itself establish secure packaging or production readiness.
