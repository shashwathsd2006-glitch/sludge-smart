# Project Completion Plan

## Audit status

Completed on 2026-11-27. The application was inspected without modifying source, database records, environment variables or authentication settings. Baseline verification:

- `PYTHONPATH=backend python3 -m pytest backend/tests -q` → 31 passed.
- `npm run build` → succeeded; Vite reported only the existing >500 kB chunk-size warning.

## Current implementation

- Seven React modules are present and use the real API with an explicit local demo fallback.
- FastAPI exposes 23 legacy business endpoints plus health and 9 authentication/user/audit endpoints.
- SQLite schema, additive migrations, PBKDF2 password hashing, bearer sessions, RBAC, audit logging, lockout, password change and administrator reset are implemented.
- Frontend authentication includes login, logout, session restoration, direct Dashboard redirect, optional password change, token injection and role-aware navigation/action gating.
- PDF and CSV exports are implemented client-side from real fetched data.

## Audit findings

### Safe, high priority

- Password-change gate uses `request.url.path`, which can break behind an ASGI `root_path`.
- Audit timestamp filters silently ignore invalid values; shadow-denial permission codes cannot be filtered through `GET /api/audit`.
- Business timestamps mix UTC-aware and naive local values.
- Legacy list endpoints have no filters or pagination.
- Generation, characterisation, handling and disposal lack update endpoints and frontend edit workflows.
- Reports fetch raw data from six endpoints instead of the existing `/api/reports/data`, omit disposal records, truncate PDF rows silently and can overflow PDF table widths.
- Delete actions have no confirmation; loading and API error states are not surfaced consistently on data pages.
- Useful read-performance indexes are absent.
- Rate-limit cleanup is not fully synchronized; expired keys are not evicted.
- Documentation contains stale claims that the frontend is unchanged and that RBAC is never reflected in the UI.

### Known limitations requiring separate approval or operational policy

- `AUTH_ENFORCEMENT=false` intentionally keeps legacy endpoints in shadow mode. It must remain unchanged until the full token rollout is verified.
- Anonymous demo mode remains available and `can()` fails open for users without roles.
- SQLite is suitable for the local demo; PostgreSQL migration planning is required for larger deployments.
- Audit rows are append-only and have no retention/archive implementation.
- Offline localStorage writes are not synchronized back to SQLite.
- Technology catalogue figures are explicitly illustrative/reference data, not site-verified measurements.
- Regulatory limits are not configured in the database; no hardcoded limits should be added without jurisdiction and source provenance.
- Multi-worker startup and process-local lockout require shared infrastructure for production.

## Completion checklist

### Phase 0 — Audit and backup verification

- [x] Inspect README and project documentation.
- [x] Inspect all frontend pages/components and backend routers/schemas/database functions.
- [x] Inspect migrations, auth/RBAC, API integration, calculations and reports.
- [x] Run backend tests and frontend build.
- [x] Create this plan before changing code.

### Phase 1 — Architecture and database

- [x] Map all endpoints and permissions.
- [x] Add additive performance indexes.
- [x] Document architecture and database schema.

### Phase 2 — Backend API completion

- [x] Add update endpoints for generation, characterisation, handling and disposal.
- [x] Add optional list filters and pagination.
- [x] Standardize UTC timestamps.
- [x] Harden validation for dates and technology settings.

### Phase 3 — Authentication and authorization

- [x] Preserve `AUTH_ENFORCEMENT=false`.
- [x] Fix `root_path` password-change gate handling.
- [x] Fix audit filter validation and shadow-denial filtering.
- [x] Add regression tests.
- [x] Keep backend authorization independent of frontend gating.

### Phase 4 — Frontend/backend integration

- [x] Use `/api/reports/data` for report snapshots with offline fallback.
- [x] Add update/edit workflows.
- [x] Surface loading, error and empty states.
- [x] Add destructive-action confirmation.
- [x] Preserve Swiss Design and all seven routes.

### Phase 5 — Business logic and reports

- [x] Add disposal report section.
- [x] Add PDF row-limit notice and fix column widths.
- [x] Wrap CSV export errors.
- [x] Reconcile calculation documentation.

### Phase 6 — Tests

- [x] Add targeted backend regression tests.
- [x] Re-run full backend suite.
- [x] Re-run frontend production build.

### Phase 7 — Documentation and deployment readiness

- [x] Create/update required documentation.
- [x] Add no-secret environment template.
- [x] Document safe startup, backup, restore and enforcement rollout.

## Final verification

- Backend regression suite: `PYTHONPATH=backend python3 -m pytest backend/tests -q` → 36 passed.
- Frontend production build: `npm run build` → succeeded; Vite reported only the existing >500 kB chunk-size warning.
- Documentation created/updated: `ARCHITECTURE.md`, `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `DEPLOYMENT.md`, `TESTING.md`, `SECURITY.md`, `USER_GUIDE.md`, `.env.example`, `README.md`, `BACKEND_AUDIT.md`, `AUTHENTICATION.md`, `RBAC.md`, `DATABASE_MIGRATIONS.md`, `AUDIT_LOGGING.md`.
- `AUTH_ENFORCEMENT` remains `false`; no deployment, database reset, hand-edit or secret exposure was performed.
- Browser-level verification of auth, role gating, edit workflows, PDF and CSV remains manual because browser automation is unavailable in this workspace.
- Operational items still requiring separate approval or policy: enforcement rollout, PostgreSQL/shared-session planning, audit retention, offline write synchronisation and site-verified technology/regulatory data.

## Rules for implementation

- Make the smallest reliable change for each finding.
- Preserve existing routes, components, API response shapes and user data.
- Never delete or recreate the live database to make tests pass.
- Never print or commit secrets, hashes, tokens or API keys.
- Do not enable `AUTH_ENFORCEMENT`.
- Do not deploy or publish anything.
- Report incomplete criteria honestly.

## Post-completion update (2026-11-27)

- Backend regression suite after the completion pass: `49 passed in 29.39s`.
- Frontend production build: `npm run build` succeeded in `10.42s`; no chunk exceeded 500 kB.
- Added route-level frontend permission guards, fail-closed authenticated permission checks, denial auditing in both shadow and enforcement modes, sanitized unhandled-error responses, partial PATCH merging, duplicate-identifier checks, absolute DB path resolution, CORS wildcard filtering, finite/bounded schema validation, DB-backed health checks and atomic report snapshots.
- Fixed frontend create-after-write, handling edit-state isolation, current-month disposal metric and locally persisted report notes.
- Live database records, roles, permissions and `AUTH_ENFORCEMENT=false` were preserved.
- Browser-level verification, live enforcement rollout, deployment, load testing and PostgreSQL remain separate approval/work items.
