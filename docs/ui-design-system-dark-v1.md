# Export Client — Unified Dark Enterprise UI Design System v1.0

> Status: Draft for implementation review. This is a visual and interaction specification, not evidence of runtime readiness, security approval, legal compliance, or Syariah approval.
> Scope: Web, Mobile, and Desktop clients. The three clients retain their platform-specific interaction patterns while sharing one design language.
> Data: Use synthetic/demo data in design previews and tests only.

## 1. Product experience principles

1. Enterprise clarity: prioritize work queues, transaction state, ownership, and next actions over decorative dashboards.
2. Role-aware navigation: Buyer, Seller, Supplier, Warehouse, QC, Logistics, Auditor, Syariah Reviewer, and Platform Admin see only the navigation affordances assigned by the authorization contract.
3. Tenant safety: the UI may display the active tenant returned by the server, but must never establish tenant membership or authorize access itself.
4. Evidence-first workflows: approvals, contract versions, shipment milestones, QC outcomes, and audit events expose traceable evidence references.
5. Progressive disclosure: show the decision-critical summary first; expose detailed records, history, and supporting documents on demand.
6. Honest status: distinguish local save, pending sync, peer delivery, review required, blocked, and completed. Never imply that queued work is synchronized or approved.
7. Accessible by default: keyboard navigation on Web/Desktop, screen-reader labels, visible focus, minimum contrast targets, and status labels/icons in addition to color.

## 2. Visual foundations

### Color tokens

| Token | Value | Usage |
|---|---|---|
| canvas | #0B1220 | App background |
| surface-1 | #111C2E | Sidebar and primary panels |
| surface-2 | #17243A | Cards, menus, secondary panels |
| surface-3 | #1E2D45 | Hover and selected surfaces |
| border | #2B3B52 | Dividers and control outlines |
| text-primary | #F8FAFC | Main content |
| text-secondary | #A8B6C8 | Supporting content |
| text-muted | #718198 | Low-priority metadata |
| brand-primary | #3B82F6 | Primary actions and links |
| brand-accent | #14B8A6 | Positive progress and highlights |
| status-success | #22C55E | Verified success |
| status-warning | #F59E0B | Attention required |
| status-danger | #EF4444 | Failed or blocked |
| status-info | #38BDF8 | Informational state |

Do not use status colors as decoration. Pair every status color with readable text and, where appropriate, an icon. Avoid large saturated surfaces; use restrained accents.

### Typography and spacing

- Typeface: Inter where bundled/licensed appropriately; use the platform system sans-serif fallback.
- Display: 28–32 px / semibold; page title: 24–28 px / semibold; section title: 16–18 px / semibold; body: 14–16 px; metadata: 12–13 px.
- Base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40.
- Radius: 8 px controls, 12 px cards, 16 px large panels.
- Borders: 1 px neutral border; focus ring: 2 px brand-primary with offset.
- Motion: 120–180 ms for hover/selection; respect reduced-motion preferences.

## 3. Shared component contract

- App shell: brand, active workspace/tenant context, role-aware navigation, page content, account/session controls.
- Navigation item: icon, label, selected state, focus state, and optional count; hidden when access is not granted.
- Page header: breadcrumb, title, concise description, primary action.
- KPI card: label, value, period/context, optional trend with accessible text.
- Data table/list: clear column labels, sorting/filtering affordances, empty/loading/error states, responsive fallback.
- Status badge: semantic label plus icon; never color-only.
- Evidence row: evidence type, reference/identifier, owner, timestamp, verification state, permitted action.
- Approval panel: requested decision, actor/role, scope, evidence, decision history, and explicit confirm/cancel actions.
- Timeline: event, actor, timestamp, source/evidence reference, and current state.
- Form field: persistent label, helper text, validation message, disabled/read-only distinction.
- Notification: severity, message, action, and dismissal where appropriate.
- Sync indicator: local state and peer delivery state displayed separately.

## 4. Information architecture

### Web — Buyer and Seller Portal / Admin Console

Primary areas:
1. Overview
2. Product Catalog
3. RFQ & Quotations
4. Transactions
5. Contracts & Documents
6. Shipment & Tracking
7. Approvals & Evidence
8. Reports
9. Administration (only for authorized admin roles)

Buyer workspace: discovery, RFQ submission, quotation comparison, contract review, shipment visibility, and evidence access.
Seller workspace: catalog, RFQ response, quotation, contract obligations, fulfillment readiness, document preparation, and shipment coordination.
Admin Console: tenant/workspace administration, access review, system health, and audit visibility. Administrative UI must not grant privileges beyond server authorization.

Recommended first screen: Overview with a compact KPI row, active work queue, transaction timeline, shipment exceptions, and sync/service health. Avoid fabricated financial KPIs; use clearly labeled synthetic demo values only.

### Mobile — Field and Operational Work

Bottom navigation:
1. Home
2. Work
3. Scan / Action (contextual, only when implemented)
4. Notifications
5. Profile

Operational work areas: assigned tasks, approvals, QC inspection, warehouse receiving/release preparation, shipment milestones, evidence capture, and notifications.
Use stacked cards, large touch targets (minimum 44 × 44 pt), concise labels, and one dominant action per screen. Use native navigation, safe areas, keyboard handling, and platform conventions. Never allow the mobile client to authorize goods release.

### Desktop — Business Operations Workspace

Primary areas:
1. Operations Overview
2. Transaction Workbench
3. Document & Evidence Center
4. Monitoring & Sync
5. Data Management
6. Administration
7. Audit Explorer

Use a persistent sidebar, dense but readable work tables, multi-panel detail views, keyboard-friendly actions, and resizable/scrollable content regions. Keep destructive or high-impact actions behind explicit confirmation and server-side authorization.

## 5. Critical workflow states

Every asynchronous workflow must define:
- Initial/loading
- Empty/no records
- Ready
- Submitting
- Saved locally / pending sync
- Delivered to required peers (only when confirmed)
- Needs review / approval pending
- Blocked / rejected
- Failed with retry or escalation guidance
- Stale data / refresh required

Transaction and contract screens must distinguish draft, bilateral approval, protective suspension, signed snapshot, obligation evidence, settlement evidence, and release authorization. Display only states backed by the authoritative API response.

## 6. Security, legal, and Syariah UI guardrails

- UI visibility is not authorization. Every protected read/write must be enforced and tested server-side.
- Do not trust client-supplied tenant, role, site, ownership, settlement, approval, or goods-release claims.
- Do not expose secrets, tokens, internal peer credentials, or sensitive audit payloads in UI, logs, URLs, or screenshots.
- No real-money transaction, payment execution, goods release, or legal/Syariah compliance claim is introduced by this visual work.
- Show review-required and blocked states honestly; do not convert them into success states for visual polish.
- Preserve the approved domain invariants: signed contract snapshot as contract truth, payment ledger as settlement truth, evidence register as obligation truth, and server-side authorization as sole goods-release authority.
- Use synthetic data and redact personal/commercial data in screenshots and preview artifacts.

## 7. Platform implementation guidance

- Web: retain the existing React + Vite application and its API/data contracts. Implement tokens as CSS custom properties and component-level styles; preserve current forms, filters, tracking, auth/session behavior, and test coverage.
- Mobile: retain Expo + React Native and existing navigation/business logic. Centralize theme tokens and shared primitives; avoid broad App.tsx rewrites. Preserve safe-area, accessibility, and platform-specific interactions.
- Desktop: retain Electron main/preload boundaries, IPC contracts, and React renderer. Centralize CSS tokens and reusable components; preserve API settings, connection handling, and local data behavior.
- Do not add UI dependencies or change lockfiles until a separate dependency review confirms compatibility with the current Expo/Electron/Vite toolchains.

## 8. Delivery sequence and acceptance gates

### UI-DARK-01 — Design foundation
- Add tokens, typography, spacing, component states, and platform-specific navigation specifications.
- Acceptance: all three clients reference the same token names and semantic status meanings.

### UI-DARK-02 — Web implementation
- Implement app shell, page header, cards, tables, forms, dialogs, and responsive behavior.
- Acceptance: existing Web build, typecheck, and relevant tests pass; no API/schema/auth behavior changes.

### UI-DARK-03 — Mobile implementation
- Implement theme primitives, navigation, operational cards, forms, and accessibility states.
- Acceptance: Expo typecheck and tests pass; Android/iOS/Web exports are checked independently; runtime screenshots are captured from the candidate build.

### UI-DARK-04 — Desktop implementation
- Implement dark shell, workbench, tables, detail panels, and monitoring states.
- Acceptance: typecheck, tests, renderer build, and packaged runtime smoke checks pass on the intended runner.

### UI-DARK-05 — Cross-platform reconciliation
- Compare screen/role matrix, token parity, status semantics, accessibility, and responsive behavior.
- Acceptance: evidence references exact repository, branch, commit SHA, workflow run, artifact, and test result. No PASS without executed evidence.

## 9. Governance boundaries

This specification and visual implementation do not authorize:
- merging pull requests;
- writing directly to main;
- deployment or staging changes;
- database schema/migration changes;
- changes to authentication, authorization, tenant isolation, payment, contract, or goods-release domain logic;
- production data use or real-money transactions.

All implementation must use isolated feature branches and draft pull requests. The repository owner reviews and manually merges only after required CI and independent security/database/legal/Syariah gates are satisfied.
