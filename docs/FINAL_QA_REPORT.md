# Final QA Report

Date: 2026-11-27 (Phase 2 acceptance pass: 2026-11-28)  
Project: `/Users/shashwathsduvani/Downloads/sludge-smart-main`  
Overall status: **IMPLEMENTED BUT UNVERIFIED**

This report covers final verification and Phase 2 acceptance testing over the existing SLUDGE SMART application. The application was not rebuilt or redesigned. No destructive database action, user deletion/reset, live password modification, live auth-enforcement change, commit, push, deploy or git-root change was performed.

Status vocabulary used throughout: **VERIFIED**, **IMPLEMENTED BUT UNVERIFIED**, **PARTIALLY IMPLEMENTED**, **FAILED**, **NOT IMPLEMENTED**.

## 1. Final status and scope

- Overall status: **IMPLEMENTED BUT UNVERIFIED**.
- Backend/API, auth/RBAC isolation, audit, migrations, pure calculations, production build and live DB integrity are **VERIFIED**.
- Browser-level UI, PDF/CSV visual output, live role navigation, live offline mode and live enforcement rollout are **IMPLEMENTED BUT UNVERIFIED** because browser automation is unavailable in this workspace.
- PostgreSQL, shared multi-worker session/lockout infrastructure, audit retention, offline write synchronization and jurisdiction-specific regulatory thresholds are **NOT IMPLEMENTED**.
- No unresolved defect is classified as **FAILED**.

## 2. Audit findings

| Finding | Disposition |
|---|---|
| `valid_date()` accepted malformed calendar-like strings | Fixed in `backend/app/schemas.py`; regression test added. |
| Compliance PATCH could not update `area`/`requirement` and could not explicitly clear `due_date` | Fixed in `backend/app/schemas.py` and `backend/app/routers.py`; regression test added. |
| Technology page destructured `settings.error` but settings expose `error` | Fixed in `src/pages/Technology.jsx`. |
| Reports DataTable used `final_mass` instead of `finalMass` | Fixed in `src/pages/Reports.jsx`. |
| Compliance inline status/note updates had no visible error handling | Fixed in `src/pages/Compliance.jsx`. |
| Compliance disposal total used all rows instead of filtered rows | Fixed in `src/pages/Compliance.jsx`. |
| Dashboard had static sample badges and no error/empty states in chart/table panels | Fixed in `src/pages/Dashboard.jsx`. |
| All pages were eagerly imported; build emitted a >500 kB chunk warning | Route-level `lazy`/`Suspense` added in `src/App.jsx` and `src/components/AuthGate.jsx`; warning no longer occurs. |
| `.gitignore` ignored `.env.example` and did not ignore `.venv`/`.DS_Store` | Fixed. |
| `.env.example` omitted `VITE_API_URL` | Fixed. |
| Docs said session restore used `localStorage` and described the old compliance PATCH shape | Fixed in `docs/ARCHITECTURE.md` and `docs/API_DOCUMENTATION.md`. |

## 3. Feature status summary

| Feature | Status | Basis |
|---|---|---|
| Backend CRUD, filters, PATCH endpoints and response compatibility | VERIFIED | 42 backend tests including exact legacy response-shape guards. |
| Auth/session/password/lockout/audit | VERIFIED in isolated tests | Temporary DBs only; live DB untouched. |
| Auth enforcement in the existing environment | IMPLEMENTED BUT UNVERIFIED | `AUTH_ENFORCEMENT=false` preserved; flag not changed. |
| Seven application modules | IMPLEMENTED BUT UNVERIFIED | API and calculation layers verified; browser interaction not automated. |
| Reports PDF/CSV visual content | IMPLEMENTED BUT UNVERIFIED | Snapshot/API verified; export files not visually opened. |
| Offline demo mode | PARTIALLY IMPLEMENTED | Read/local writes exist; sync/conflict resolution does not. |
| PostgreSQL deployment | NOT IMPLEMENTED | Strategy documented only. |
| Audit retention/archive | NOT IMPLEMENTED | Policy/architecture decision outstanding. |
| Browser test automation | NOT IMPLEMENTED | Tooling absent; manual checklist documented. |
| Unresolved defects | FAILED | None. |

## 4. Exact files changed in this final QA pass

Backend:
- `backend/app/schemas.py`
- `backend/app/routers.py`
- `backend/tests/test_completion_fixes.py`
- `backend/tests/test_final_qa.py` (new)

Frontend:
- `src/App.jsx`
- `src/components/AuthGate.jsx`
- `src/pages/Technology.jsx`
- `src/pages/Compliance.jsx`
- `src/pages/Reports.jsx`
- `src/pages/Dashboard.jsx`

Configuration and documentation:
- `.gitignore`
- `.env.example`
- `docs/ARCHITECTURE.md`
- `docs/API_DOCUMENTATION.md`
- `docs/TESTING.md`
- `docs/DEPLOYMENT.md`
- `docs/SECURITY.md`
- `docs/GIT_REPOSITORY_HYGIENE.md` (new)
- `docs/FINAL_QA_REPORT.md` (new)

## 5. Database and migration changes

No database or migration change was made in this final pass.

Read-only live audit result:

- `data/sludge_smart.db` exists; size `163840` bytes.
- `PRAGMA integrity_check`: `ok`.
- `PRAGMA foreign_key_check`: `[]`.
- Applied migrations: `001_phase1`, `002_password_management`, `003_completion_additions`.
- Record counts: generation `15`, lab `10`, handling `8`, disposal `6`, compliance `12`, technology `1`, users `1`, roles `4`, permissions `21`, role-permission rows `52`, sessions `5` total/`4` active, audit rows `23`.
- Only user: `Gowtham`; `is_active=1`, `must_change_password=0`, role `administrator`.
- `shashwath`, `test_operator`, `test_laboratory` and `test_ehs_reviewer` do not exist.
- No live user, session, password, hash or business record was created, changed or deleted.
- Tests used temporary DBs and did not write to `data/sludge_smart.db`.

This is the historical snapshot taken at that point in the QA pass. Later authorized account creation and password-flag updates are recorded in sections 10 and 11; the completion-pass state is recorded in section 12.

## 6. Auth and RBAC status

Status: **VERIFIED in isolated tests; live enforcement IMPLEMENTED BUT UNVERIFIED**.

- `AUTH_ENFORCEMENT=false` remains unchanged in the existing environment.
- Enforcement mode was tested only via isolated temp DBs.
- All 23 legacy business endpoints return `401` for anonymous requests when enforcement is enabled.
- Role matrices, shadow-denial audit rows, password change, lockout recovery, admin user management, invalid/expired/revoked sessions and persistence across app restart were verified.
- Backend permissions remain authoritative. Frontend `can()` preserves anonymous/offline demo access but fails closed for role-less authenticated users after the completion pass.
- `updated_at` columns remain intentionally unexposed to preserve exact legacy response shapes.
- Session restoration uses `sessionStorage`; offline demo records use a separate `localStorage` namespace.

## 7. Module 01 — Visual analytics dashboard

Status: **IMPLEMENTED BUT UNVERIFIED**.

- **VERIFIED**: generation/handling calculations asserted against `src/lib/calc.js`; production build succeeded.
- **IMPLEMENTED BUT UNVERIFIED**: rendered charts, filters, metric cards, sample badges and error/empty states in a browser.
- Fixes applied: dynamic sample badges, `DataState` wrappers, visible load error banner and retry-capable error state.
- Manual check: load dashboard with backend online, stop backend, reload, restore backend and confirm banner/error transitions.

## 8. Module 02 — Generation

Status: **IMPLEMENTED BUT UNVERIFIED**.

- **VERIFIED**: CRUD/PATCH/list filters/date validation via backend tests; calculation outputs via Node assertions.
- **IMPLEMENTED BUT UNVERIFIED**: browser create/edit/delete, filter UI and confirmation dialogs.
- Compatibility: response keys unchanged.

## 9. Module 03 — Characterisation

Status: **IMPLEMENTED BUT UNVERIFIED**.

- **VERIFIED**: CRUD/PATCH/list filters, strict ISO dates, missing-parameter and screening-band calculations.
- **IMPLEMENTED BUT UNVERIFIED**: browser record entry, missing-value display, out-of-band flags and CSV/PDF rendering.
- Screening bands remain illustrative review aids, not regulatory limits.

## 10. Module 04 — Handling

Status: **IMPLEMENTED BUT UNVERIFIED**.

- **VERIFIED**: CRUD/PATCH/list filters and dry-solids mass-balance calculations (`1000 kg @ 91% -> 300 kg @ 70%`).
- **IMPLEMENTED BUT UNVERIFIED**: browser process-run entry and chart/table rendering.
- Documentation retains the assumption that solids are fully retained and losses are not modelled.

## 11. Module 05 — Technology

Status: **IMPLEMENTED BUT UNVERIFIED**.

- **VERIFIED**: settings GET/PUT, score bounds, NaN/infinity rejection and ranking calculations; sample ranking starts with `solar-drying`.
- **FIXED**: settings error destructuring defect.
- **IMPLEMENTED BUT UNVERIFIED**: browser weight normalization, score editing and provenance display.
- Jurisdiction-specific decision thresholds are **NOT IMPLEMENTED**.

## 12. Module 06 — Compliance

Status: **IMPLEMENTED BUT UNVERIFIED**.

- **VERIFIED**: full checklist PATCH (`status`, `area`, `requirement`, `detail`, `note`), explicit `due_date: null` clearing, audit rows, disposal CRUD and filters.
- **FIXED**: inline update errors and filtered disposal total.
- **IMPLEMENTED BUT UNVERIFIED**: browser checklist/status/inline-note workflows and disposal register visual totals.

## 13. Module 07 — Reports

Status: **IMPLEMENTED BUT UNVERIFIED**.

- **VERIFIED**: report snapshot includes user-created records, exact legacy response shape and all nine report sections in the generated payload.
- **FIXED**: `finalMass` sort key and retryable error state.
- **IMPLEMENTED BUT UNVERIFIED**: visual A4 PDF, downloaded PDF content and CSV content/row filtering in a browser.
- No downloadable file was opened in this workspace.

## 14. Backend verification result

Status: **VERIFIED**.

Command:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests -q
```

Result: `42 passed in 9.87s`.

Coverage includes API compatibility, auth, RBAC, audit, migrations, completion fixes and final QA integration tests. Tests use temp DBs.

## 15. Frontend verification result

Status: **IMPLEMENTED BUT UNVERIFIED** for runtime; build **VERIFIED**.

Command:

```bash
npm run build
```

Result: successful in `2.73s`, no chunk-size warning. Chunks include:

- `index-DJUE8WQC.js` `199.13 kB` (`64.14 kB` gzip)
- `Charts-B1dY4Vqu.js` `399.47 kB` (`109.40 kB` gzip)
- `jspdf.es.min-Du_aMK8H.js` `357.67 kB` (`117.99 kB` gzip)
- `html2canvas.esm-CBrSDip1.js` `201.42 kB` (`48.03 kB` gzip)
- route chunks between `1.05 kB` and `17.38 kB`

No frontend unit tests, lint or typecheck script are configured. `package.json` exposes only `dev`, `build` and `preview`.

## 16. Browser verification result

Status: **NOT IMPLEMENTED** in this workspace.

- Python `playwright` spec: `False`.
- `npm ls playwright puppeteer --depth=0`: empty.
- No `chromium`, `google-chrome` or `playwright` binary found.
- No UI claim is made from browser execution.
- Manual procedures are recorded in `docs/TESTING.md` and sections 7–13 of this report.

## 17. Integration verification result

Status: **VERIFIED for API integration; IMPLEMENTED BUT UNVERIFIED for full browser integration**.

Verified with TestClient against temp DBs:

- validation failure leaves no row,
- created records persist after app restart,
- reports snapshot includes created data,
- audit rows contain before/after values,
- password-change gate, lockout recovery and session revocation,
- enforcement-mode RBAC and anonymous 401s across all 23 legacy endpoints.

## 18. Calculation verification result

Status: **VERIFIED**.

Command:

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict'; import { generationMetrics, handlingMetrics, matrixResults, normalizeWeights, screeningFlags, missingParameters } from './src/lib/calc.js'; const sample = JSON.parse(readFileSync('./shared/sample-data.json', 'utf8')); const g = generationMetrics({ wet_sludge_kg: 1120, moisture_pct: 94.2, wastewater_m3: 420, operating_days: 26 }); assert.ok(Math.abs(g.dry - 64.96) < 0.01); assert.ok(Math.abs(g.rate - 0.1547) < 0.001); const h = handlingMetrics({ initial_mass_kg: 1000, initial_moisture_pct: 91, final_moisture_pct: 70 }); assert.ok(Math.abs(h.finalMass - 300) < 0.001); assert.ok(Math.abs(h.reduction - 70) < 0.001); const ranking = matrixResults(sample.technology); assert.equal(ranking[0].id, 'solar-drying'); assert.equal(ranking.length, 10); assert.equal(Object.values(normalizeWeights(sample.technology.weights)).reduce((a, b) => a + b, 0), 100); const missingLab = sample.lab.find((row) => row.cadmium_mgkg === null); assert.ok(missingParameters(missingLab).includes('cadmium_mgkg')); const flaggedLab = sample.lab.find((row) => screeningFlags(row).length > 0); assert.ok(flaggedLab); console.log('calculation checks passed');"
```

Result: `calculation checks passed`.

## 19. Security status

Status: **VERIFIED for documented safeguards in tests; live deployment IMPLEMENTED BUT UNVERIFIED**.

- PBKDF2-SHA256 with per-password salt and `hmac.compare_digest`.
- Only SHA-256 token hashes are stored.
- Password change keeps current session, revokes others; admin reset revokes all and forces change.
- Strict request schemas, `YYYY-MM-DD` dates, bounded roles/statuses and NaN/infinity rejection.
- CORS explicit allowlist, no wildcard and `allow_credentials=False`.
- Append-only audit rows with redaction and request correlation.
- No secrets, hashes, tokens or API keys are present in the repository.
- Security-policy changes require explicit approval.

## 20. Offline limitations

Status: **PARTIALLY IMPLEMENTED**.

- Offline demo records are stored in browser `localStorage` under a separate namespace.
- Invalid API JSON/responses become visible errors instead of silent demo fallback.
- No offline-to-online synchronization, conflict resolution, queue replay or server reconciliation is implemented.
- Offline storage is not suitable for regulated records.
- `sessionStorage` session loss and DB session revocation both end the session.

## 21. Endpoints still needing live enforcement verification

Anonymous enforcement is **VERIFIED** in isolated tests. Browser/role-specific live enforcement remains **IMPLEMENTED BUT UNVERIFIED** for:

- `GET|POST|PATCH|DELETE /api/generation`
- `GET|POST|PATCH|DELETE /api/characterisation`
- `GET|POST|PATCH|DELETE /api/handling`
- `GET|POST|PATCH|DELETE /api/disposals`
- `GET|POST|PATCH|DELETE /api/compliance`
- `GET|PUT /api/technology`
- `GET /api/reports/data`
- strict auth/user endpoints: `/api/auth/me`, `/api/auth/logout`, `/api/auth/change-password`, `/api/auth/users`, `/api/auth/users/{id}`, `/api/auth/users/{id}/reset-password`, `/api/audit`

## 22. Test account API request templates

These templates are retained for reproducibility. The three approved accounts were subsequently created through a secure workflow; no password or token value is recorded here. Supply any future passwords through hidden prompts and environment variables only.

```bash
API_URL="${API_URL:-http://localhost:8000}"
ADMIN_USERNAME="${ADMIN_USERNAME:?set admin username}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?set admin password}"

ADMIN_TOKEN=$(curl -sS -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')

curl -sS -X POST "$API_URL/api/auth/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"test_operator\",\"password\":\"$TEST_OPERATOR_PASSWORD\",\"full_name\":\"Test Operator\",\"email\":\"operator@example.invalid\",\"roles\":[\"operator\"]}"

curl -sS -X POST "$API_URL/api/auth/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"test_laboratory\",\"password\":\"$TEST_LABORATORY_PASSWORD\",\"full_name\":\"Test Laboratory\",\"email\":\"laboratory@example.invalid\",\"roles\":[\"laboratory\"]}"

curl -sS -X POST "$API_URL/api/auth/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"test_ehs_reviewer\",\"password\":\"$TEST_EHS_REVIEWER_PASSWORD\",\"full_name\":\"Test EHS Reviewer\",\"email\":\"ehs@example.invalid\",\"roles\":[\"ehs_reviewer\"]}"
```

`shashwath` was not included because no role was specified; add it only with an explicitly approved role and password variable.

## 23. Performance and deployment readiness

- Runtime browser performance is **IMPLEMENTED BUT UNVERIFIED**; no profiling was performed.
- Build performance improved after code splitting; no >500 kB warning remains.
- Recharts and jsPDF remain the largest chunks and should be loaded only on their routes.
- Local deployment is ready using the commands in section 25.
- Production deployment is **IMPLEMENTED BUT UNVERIFIED**: HTTPS, reverse proxy, process supervision, monitoring, backups, audit retention and shared infrastructure remain deployment responsibilities.
- PostgreSQL migration is **NOT IMPLEMENTED**; staged strategy is documented in `docs/DEPLOYMENT.md`.
- No deployment or security-policy change was performed.

## 24. Test counts, blockers and git findings

Test counts:

- Backend tests: `42` passed.
- Frontend unit tests: `0` configured.
- Browser tests: `0` executed (tooling unavailable).
- Production builds: `1` successful.
- Pure calculation verification scripts: `1` passed.
- Live DB read-only audits: `2` consistent.
- Unresolved failed tests: `0`.

Blockers requiring owner approval:

- Enable `AUTH_ENFORCEMENT=true` in a controlled environment.
- Perform browser-level UI/PDF/CSV/offline verification.
- Decide PostgreSQL/shared infrastructure and audit-retention policy.
- Decide commit/repository strategy and authorize any git operation.

Git findings:

- `git rev-parse --show-toplevel` resolves to `/Users/shashwathsduvani`, not the project directory.
- Project is untracked in that home-rooted repository.
- No commits, remotes, staged index entries or project-local git objects were observed.
- No git state was changed.
- `.env.example` is now explicitly unignored; `.env`, DB files, backups, `node_modules`, `dist`, `.venv`, caches and OS metadata are ignored.
- See `docs/GIT_REPOSITORY_HYGIENE.md`.

## 25. Startup commands, next action and final determination

Start backend:

```bash
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Start frontend:

```bash
npm run dev
```

Build frontend:

```bash
npm run build
```

Run backend tests:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests -q
```

Next action: review this report and approve the limited follow-ups in section 24. Do not commit, push, deploy, change git roots, reset the DB or enable live auth enforcement without that approval.

Final determination: **IMPLEMENTED BUT UNVERIFIED**. The implemented application passes all available automated checks and preserves live data, but browser-level behavior, live enforcement and production deployment remain unverified by design in this workspace.

## Addendum — administrator recovery and RBAC test-account creation

Status: **VERIFIED** for the live user records and permission matrix; **IMPLEMENTED BUT UNVERIFIED** for browser-level role behavior.

Administrator recovery:

- An approved controlled local recovery was executed after backup and integrity verification.
- `Gowtham` ID `1` remained active, username unchanged and role unchanged as `administrator`.
- `must_change_password` was set to `true`; `failed_attempts` was cleared to `0`; `locked_until` was cleared to `NULL`; all existing sessions were revoked.
- A `PASSWORD_RESET` audit row with ID `32` was recorded with actor `local_recovery`.
- No password, hash or token value was displayed or stored in project files.

Account creation:

- Administrator token was validated via `GET /api/auth/me`; no new login was attempted and no credential was displayed.
- `GET /api/auth/users` before creation showed only `Gowtham`; none of the requested test usernames existed.
- `POST /api/auth/users` was called only for the three missing accounts.

| Username | Result | User ID | Assigned role | Active | Must change password |
|---|---|---:|---|---|---|
| `test_operator` | CREATED | `2` | `operator` | `true` | `true` |
| `test_laboratory` | CREATED | `3` | `laboratory` | `true` | `true` |
| `test_ehs_reviewer` | CREATED | `4` | `ehs_reviewer` | `true` | `true` |

No account was skipped because none already existed. Every new account has exactly one role and no administrator permissions. Temporary passwords were taken from an out-of-repository private credentials file and were never printed.

This table records the state immediately after creation. Section 10 records the later authorized password-flag update for IDs `3` and `4`; section 11 records the administrator recovery and `test_operator` password-flag update.

Verification:

- `GET /api/auth/users` after creation returned all four users with the statuses above.
- `Gowtham` ID `1` was byte-for-byte unchanged across the before/after non-sensitive user snapshot: active, role `administrator`, `must_change_password=true`.
- Required permissions were present without modifying any permission definitions:
  - operator: `generation:write`, `lab:read`, `handling:write`, `technology:read`, `compliance:read`, `reports:read`;
  - laboratory: `generation:read`, `lab:write`, `handling:read`, `technology:read`, `compliance:read`, `reports:read`;
  - ehs_reviewer: `generation:read`, `lab:read`, `handling:read`, `technology:read`, `compliance:write`, `reports:read`.
- Additional pre-existing permissions were left unchanged.
- Dashboard access is available to all authenticated roles; it has no dedicated permission code.
- Live DB integrity remained `ok` and `foreign_key_check` remained empty.
- `AUTH_ENFORCEMENT` was not changed.

Endpoints used: `GET /api/auth/me`, `GET /api/auth/users`, `POST /api/auth/users`.

Errors or skipped operations: none. Browser-level role navigation and enforced endpoint behavior remain **IMPLEMENTED BUT UNVERIFIED** because the live flag remains in shadow mode and browser automation is unavailable.

## Addendum — comprehensive RBAC verification

Status: **VERIFIED** for API-level authorization, status codes, mutation side effects and audit logging in an isolated enforcement-mode process; **IMPLEMENTED BUT UNVERIFIED** for browser-level navigation and live production enforcement.

Scope protections:

- Live `data/sludge_smart.db` was opened read-only for before/after snapshots and was byte-for-byte consistent across the run.
- No live password, role, permission, authentication setting, business record or session was modified.
- `AUTH_ENFORCEMENT=true` was set only inside the isolated test process and temporary DB; the live value remains unchanged.
- Test users reused the four requested usernames only inside the temporary DB with generated non-production credentials that were never displayed.
- All records created, updated and deleted during the suite existed only in `/var/folders/00/jsy3k3ls4zv8x72vs6d22dkc0000gn/T/opencode/rbac-verification-20261127/sludge_smart_rbac.db`.

Method: `fastapi.testclient.TestClient` called the real backend API with bearer tokens. Expected allow/deny outcomes were derived from the role-permission matrix read from the temporary DB. Anonymous, invalid-token, wrong-role, read, create, update, delete, approval and audit cases were executed directly through HTTP endpoints, not only through frontend code.

Frontend access verification status:

| Module | Route | Gating permission | Verification status |
| --- | --- | --- | --- |
| Dashboard | `/` | `reports:read` | VERIFIED from static source; browser not executed |
| Sludge Generation | `/generation` | `generation:read` | VERIFIED from static source; browser not executed |
| Characterisation | `/characterisation` | `lab:read` | VERIFIED from static source; browser not executed |
| Handling / Disposal | `/handling` | `handling:read` | VERIFIED from static source; browser not executed |
| Technology Selection | `/technology` | `technology:read` | VERIFIED from static source; browser not executed |
| Compliance | `/compliance` | `compliance:read` | VERIFIED from static source; browser not executed |
| Reports | `/reports` | `reports:read` | VERIFIED from static source; browser not executed |

- The exported frontend permission matrix matches the backend role-permission matrix for all four roles and all 21 permission codes.
- Navigation filtering is in `src/components/Layout.jsx:19`; per-route authorization is absent from `src/App.jsx` and `src/components/AuthGate.jsx`.
- Browser-level role navigation remains **IMPLEMENTED BUT UNVERIFIED** because browser automation is unavailable in this workspace.

### Isolated RBAC API verification results

- Generated: 2026-11-27T20:20:20
- Test process enforcement: enabled
- Live DB: read-only snapshot before/after
- Live DB unchanged: True
- Frontend matrix matches backend matrix: True
- Cases: 134 total, 134 passed, 0 failed

### Role permission matrix

| Role | Permissions |
| --- | --- |
| administrator | `audit:read, compliance:delete, compliance:read, compliance:write, disposal:delete, disposal:read, disposal:write, generation:delete, generation:read, generation:write, handling:delete, handling:read, handling:write, lab:delete, lab:read, lab:write, reports:read, technology:read, technology:write, users:read, users:write` |
| ehs_reviewer | `audit:read, compliance:read, compliance:write, disposal:read, generation:read, handling:read, lab:read, reports:read, technology:read` |
| laboratory | `compliance:read, disposal:read, generation:read, handling:read, lab:delete, lab:read, lab:write, reports:read, technology:read` |
| operator | `compliance:read, disposal:delete, disposal:read, disposal:write, generation:delete, generation:read, generation:write, handling:delete, handling:read, handling:write, lab:read, reports:read, technology:read` |

### Case results

| ID | Role | Module | Op | Method | Path | Permission | Expected | Actual | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PUB-001 | anonymous | Health | read | GET | `/api/health` | - | 200 | 200 | PASS |
| READ-administrator-Sludge Generation | administrator | Sludge Generation | read | GET | `/api/generation` | generation:read | 200 | 200 | PASS |
| CREATE-administrator-Sludge Generation | administrator | Sludge Generation | create | POST | `/api/generation` | generation:write | 201 | 201 | PASS |
| UPDATE-administrator-Sludge Generation | administrator | Sludge Generation | update | PATCH | `/api/generation/15` | generation:write | 200 | 200 | PASS |
| DELETE-administrator-Sludge Generation | administrator | Sludge Generation | delete | DELETE | `/api/generation/18` | generation:delete | 200 | 200 | PASS |
| READ-administrator-Characterisation | administrator | Characterisation | read | GET | `/api/characterisation` | lab:read | 200 | 200 | PASS |
| CREATE-administrator-Characterisation | administrator | Characterisation | create | POST | `/api/characterisation` | lab:write | 201 | 201 | PASS |
| UPDATE-administrator-Characterisation | administrator | Characterisation | update | PATCH | `/api/characterisation/11` | lab:write | 200 | 200 | PASS |
| DELETE-administrator-Characterisation | administrator | Characterisation | delete | DELETE | `/api/characterisation/14` | lab:delete | 200 | 200 | PASS |
| READ-administrator-Handling / Disposal | administrator | Handling / Disposal | read | GET | `/api/handling` | handling:read | 200 | 200 | PASS |
| CREATE-administrator-Handling / Disposal | administrator | Handling / Disposal | create | POST | `/api/handling` | handling:write | 201 | 201 | PASS |
| UPDATE-administrator-Handling / Disposal | administrator | Handling / Disposal | update | PATCH | `/api/handling/9` | handling:write | 200 | 200 | PASS |
| DELETE-administrator-Handling / Disposal | administrator | Handling / Disposal | delete | DELETE | `/api/handling/12` | handling:delete | 200 | 200 | PASS |
| READ-administrator-Disposal Records | administrator | Disposal Records | read | GET | `/api/disposals` | disposal:read | 200 | 200 | PASS |
| CREATE-administrator-Disposal Records | administrator | Disposal Records | create | POST | `/api/disposals` | disposal:write | 201 | 201 | PASS |
| UPDATE-administrator-Disposal Records | administrator | Disposal Records | update | PATCH | `/api/disposals/7` | disposal:write | 200 | 200 | PASS |
| DELETE-administrator-Disposal Records | administrator | Disposal Records | delete | DELETE | `/api/disposals/10` | disposal:delete | 200 | 200 | PASS |
| READ-administrator-Compliance | administrator | Compliance | read | GET | `/api/compliance` | compliance:read | 200 | 200 | PASS |
| CREATE-administrator-Compliance | administrator | Compliance | create | POST | `/api/compliance` | compliance:write | 201 | 201 | PASS |
| UPDATE-administrator-Compliance | administrator | Compliance | update | PATCH | `/api/compliance/13` | compliance:write | 200 | 200 | PASS |
| DELETE-administrator-Compliance | administrator | Compliance | delete | DELETE | `/api/compliance/16` | compliance:delete | 200 | 200 | PASS |
| REPORT-administrator | administrator | Reports | read | GET | `/api/reports/data` | reports:read | 200 | 200 | PASS |
| TECHREAD-administrator | administrator | Technology Selection | read | GET | `/api/technology` | technology:read | 200 | 200 | PASS |
| TECHWRITE-administrator | administrator | Technology Selection | update | PUT | `/api/technology` | technology:write | 200 | 200 | PASS |
| APPROVAL-administrator | administrator | Compliance | approval | PATCH | `/api/compliance/17` | compliance:write | 200 | 200 | PASS |
| USERSREAD-administrator | administrator | User Administration | read | GET | `/api/auth/users` | users:read | 200 | 200 | PASS |
| AUDITREAD-administrator | administrator | Audit Log | read | GET | `/api/audit` | audit:read | 200 | 200 | PASS |
| USERCREATE-administrator | administrator | User Administration | create | POST | `/api/auth/users` | users:write | 201 | 201 | PASS |
| USERUPDATE-administrator | administrator | User Administration | update | PATCH | `/api/auth/users/5` | users:write | 200 | 200 | PASS |
| USERRESET-administrator | administrator | User Administration | password reset | POST | `/api/auth/users/5/reset-password` | users:write | 200 | 200 | PASS |
| READ-operator-Sludge Generation | operator | Sludge Generation | read | GET | `/api/generation` | generation:read | 200 | 200 | PASS |
| CREATE-operator-Sludge Generation | operator | Sludge Generation | create | POST | `/api/generation` | generation:write | 201 | 201 | PASS |
| UPDATE-operator-Sludge Generation | operator | Sludge Generation | update | PATCH | `/api/generation/15` | generation:write | 200 | 200 | PASS |
| DELETE-operator-Sludge Generation | operator | Sludge Generation | delete | DELETE | `/api/generation/20` | generation:delete | 200 | 200 | PASS |
| READ-operator-Characterisation | operator | Characterisation | read | GET | `/api/characterisation` | lab:read | 200 | 200 | PASS |
| CREATE-operator-Characterisation | operator | Characterisation | create | POST | `/api/characterisation` | lab:write | 403 | 403 | PASS |
| UPDATE-operator-Characterisation | operator | Characterisation | update | PATCH | `/api/characterisation/11` | lab:write | 403 | 403 | PASS |
| DELETE-operator-Characterisation | operator | Characterisation | delete | DELETE | `/api/characterisation/15` | lab:delete | 403 | 403 | PASS |
| READ-operator-Handling / Disposal | operator | Handling / Disposal | read | GET | `/api/handling` | handling:read | 200 | 200 | PASS |
| CREATE-operator-Handling / Disposal | operator | Handling / Disposal | create | POST | `/api/handling` | handling:write | 201 | 201 | PASS |
| UPDATE-operator-Handling / Disposal | operator | Handling / Disposal | update | PATCH | `/api/handling/9` | handling:write | 200 | 200 | PASS |
| DELETE-operator-Handling / Disposal | operator | Handling / Disposal | delete | DELETE | `/api/handling/14` | handling:delete | 200 | 200 | PASS |
| READ-operator-Disposal Records | operator | Disposal Records | read | GET | `/api/disposals` | disposal:read | 200 | 200 | PASS |
| CREATE-operator-Disposal Records | operator | Disposal Records | create | POST | `/api/disposals` | disposal:write | 201 | 201 | PASS |
| UPDATE-operator-Disposal Records | operator | Disposal Records | update | PATCH | `/api/disposals/7` | disposal:write | 200 | 200 | PASS |
| DELETE-operator-Disposal Records | operator | Disposal Records | delete | DELETE | `/api/disposals/12` | disposal:delete | 200 | 200 | PASS |
| READ-operator-Compliance | operator | Compliance | read | GET | `/api/compliance` | compliance:read | 200 | 200 | PASS |
| CREATE-operator-Compliance | operator | Compliance | create | POST | `/api/compliance` | compliance:write | 403 | 403 | PASS |
| UPDATE-operator-Compliance | operator | Compliance | update | PATCH | `/api/compliance/13` | compliance:write | 403 | 403 | PASS |
| DELETE-operator-Compliance | operator | Compliance | delete | DELETE | `/api/compliance/18` | compliance:delete | 403 | 403 | PASS |
| REPORT-operator | operator | Reports | read | GET | `/api/reports/data` | reports:read | 200 | 200 | PASS |
| TECHREAD-operator | operator | Technology Selection | read | GET | `/api/technology` | technology:read | 200 | 200 | PASS |
| TECHWRITE-operator | operator | Technology Selection | update | PUT | `/api/technology` | technology:write | 403 | 403 | PASS |
| APPROVAL-operator | operator | Compliance | approval | PATCH | `/api/compliance/19` | compliance:write | 403 | 403 | PASS |
| USERSREAD-operator | operator | User Administration | read | GET | `/api/auth/users` | users:read | 403 | 403 | PASS |
| AUDITREAD-operator | operator | Audit Log | read | GET | `/api/audit` | audit:read | 403 | 403 | PASS |
| USERCREATE-operator | operator | User Administration | create | POST | `/api/auth/users` | users:write | 403 | 403 | PASS |
| USERUPDATE-operator | operator | User Administration | update | PATCH | `/api/auth/users/5` | users:write | 403 | 403 | PASS |
| USERRESET-operator | operator | User Administration | password reset | POST | `/api/auth/users/5/reset-password` | users:write | 403 | 403 | PASS |
| READ-laboratory-Sludge Generation | laboratory | Sludge Generation | read | GET | `/api/generation` | generation:read | 200 | 200 | PASS |
| CREATE-laboratory-Sludge Generation | laboratory | Sludge Generation | create | POST | `/api/generation` | generation:write | 403 | 403 | PASS |
| UPDATE-laboratory-Sludge Generation | laboratory | Sludge Generation | update | PATCH | `/api/generation/15` | generation:write | 403 | 403 | PASS |
| DELETE-laboratory-Sludge Generation | laboratory | Sludge Generation | delete | DELETE | `/api/generation/21` | generation:delete | 403 | 403 | PASS |
| READ-laboratory-Characterisation | laboratory | Characterisation | read | GET | `/api/characterisation` | lab:read | 200 | 200 | PASS |
| CREATE-laboratory-Characterisation | laboratory | Characterisation | create | POST | `/api/characterisation` | lab:write | 201 | 201 | PASS |
| UPDATE-laboratory-Characterisation | laboratory | Characterisation | update | PATCH | `/api/characterisation/11` | lab:write | 200 | 200 | PASS |
| DELETE-laboratory-Characterisation | laboratory | Characterisation | delete | DELETE | `/api/characterisation/17` | lab:delete | 200 | 200 | PASS |
| READ-laboratory-Handling / Disposal | laboratory | Handling / Disposal | read | GET | `/api/handling` | handling:read | 200 | 200 | PASS |
| CREATE-laboratory-Handling / Disposal | laboratory | Handling / Disposal | create | POST | `/api/handling` | handling:write | 403 | 403 | PASS |
| UPDATE-laboratory-Handling / Disposal | laboratory | Handling / Disposal | update | PATCH | `/api/handling/9` | handling:write | 403 | 403 | PASS |
| DELETE-laboratory-Handling / Disposal | laboratory | Handling / Disposal | delete | DELETE | `/api/handling/15` | handling:delete | 403 | 403 | PASS |
| READ-laboratory-Disposal Records | laboratory | Disposal Records | read | GET | `/api/disposals` | disposal:read | 200 | 200 | PASS |
| CREATE-laboratory-Disposal Records | laboratory | Disposal Records | create | POST | `/api/disposals` | disposal:write | 403 | 403 | PASS |
| UPDATE-laboratory-Disposal Records | laboratory | Disposal Records | update | PATCH | `/api/disposals/7` | disposal:write | 403 | 403 | PASS |
| DELETE-laboratory-Disposal Records | laboratory | Disposal Records | delete | DELETE | `/api/disposals/13` | disposal:delete | 403 | 403 | PASS |
| READ-laboratory-Compliance | laboratory | Compliance | read | GET | `/api/compliance` | compliance:read | 200 | 200 | PASS |
| CREATE-laboratory-Compliance | laboratory | Compliance | create | POST | `/api/compliance` | compliance:write | 403 | 403 | PASS |
| UPDATE-laboratory-Compliance | laboratory | Compliance | update | PATCH | `/api/compliance/13` | compliance:write | 403 | 403 | PASS |
| DELETE-laboratory-Compliance | laboratory | Compliance | delete | DELETE | `/api/compliance/20` | compliance:delete | 403 | 403 | PASS |
| REPORT-laboratory | laboratory | Reports | read | GET | `/api/reports/data` | reports:read | 200 | 200 | PASS |
| TECHREAD-laboratory | laboratory | Technology Selection | read | GET | `/api/technology` | technology:read | 200 | 200 | PASS |
| TECHWRITE-laboratory | laboratory | Technology Selection | update | PUT | `/api/technology` | technology:write | 403 | 403 | PASS |
| APPROVAL-laboratory | laboratory | Compliance | approval | PATCH | `/api/compliance/21` | compliance:write | 403 | 403 | PASS |
| USERSREAD-laboratory | laboratory | User Administration | read | GET | `/api/auth/users` | users:read | 403 | 403 | PASS |
| AUDITREAD-laboratory | laboratory | Audit Log | read | GET | `/api/audit` | audit:read | 403 | 403 | PASS |
| USERCREATE-laboratory | laboratory | User Administration | create | POST | `/api/auth/users` | users:write | 403 | 403 | PASS |
| USERUPDATE-laboratory | laboratory | User Administration | update | PATCH | `/api/auth/users/5` | users:write | 403 | 403 | PASS |
| USERRESET-laboratory | laboratory | User Administration | password reset | POST | `/api/auth/users/5/reset-password` | users:write | 403 | 403 | PASS |
| READ-ehs_reviewer-Sludge Generation | ehs_reviewer | Sludge Generation | read | GET | `/api/generation` | generation:read | 200 | 200 | PASS |
| CREATE-ehs_reviewer-Sludge Generation | ehs_reviewer | Sludge Generation | create | POST | `/api/generation` | generation:write | 403 | 403 | PASS |
| UPDATE-ehs_reviewer-Sludge Generation | ehs_reviewer | Sludge Generation | update | PATCH | `/api/generation/15` | generation:write | 403 | 403 | PASS |
| DELETE-ehs_reviewer-Sludge Generation | ehs_reviewer | Sludge Generation | delete | DELETE | `/api/generation/22` | generation:delete | 403 | 403 | PASS |
| READ-ehs_reviewer-Characterisation | ehs_reviewer | Characterisation | read | GET | `/api/characterisation` | lab:read | 200 | 200 | PASS |
| CREATE-ehs_reviewer-Characterisation | ehs_reviewer | Characterisation | create | POST | `/api/characterisation` | lab:write | 403 | 403 | PASS |
| UPDATE-ehs_reviewer-Characterisation | ehs_reviewer | Characterisation | update | PATCH | `/api/characterisation/11` | lab:write | 403 | 403 | PASS |
| DELETE-ehs_reviewer-Characterisation | ehs_reviewer | Characterisation | delete | DELETE | `/api/characterisation/18` | lab:delete | 403 | 403 | PASS |
| READ-ehs_reviewer-Handling / Disposal | ehs_reviewer | Handling / Disposal | read | GET | `/api/handling` | handling:read | 200 | 200 | PASS |
| CREATE-ehs_reviewer-Handling / Disposal | ehs_reviewer | Handling / Disposal | create | POST | `/api/handling` | handling:write | 403 | 403 | PASS |
| UPDATE-ehs_reviewer-Handling / Disposal | ehs_reviewer | Handling / Disposal | update | PATCH | `/api/handling/9` | handling:write | 403 | 403 | PASS |
| DELETE-ehs_reviewer-Handling / Disposal | ehs_reviewer | Handling / Disposal | delete | DELETE | `/api/handling/16` | handling:delete | 403 | 403 | PASS |
| READ-ehs_reviewer-Disposal Records | ehs_reviewer | Disposal Records | read | GET | `/api/disposals` | disposal:read | 200 | 200 | PASS |
| CREATE-ehs_reviewer-Disposal Records | ehs_reviewer | Disposal Records | create | POST | `/api/disposals` | disposal:write | 403 | 403 | PASS |
| UPDATE-ehs_reviewer-Disposal Records | ehs_reviewer | Disposal Records | update | PATCH | `/api/disposals/7` | disposal:write | 403 | 403 | PASS |
| DELETE-ehs_reviewer-Disposal Records | ehs_reviewer | Disposal Records | delete | DELETE | `/api/disposals/14` | disposal:delete | 403 | 403 | PASS |
| READ-ehs_reviewer-Compliance | ehs_reviewer | Compliance | read | GET | `/api/compliance` | compliance:read | 200 | 200 | PASS |
| CREATE-ehs_reviewer-Compliance | ehs_reviewer | Compliance | create | POST | `/api/compliance` | compliance:write | 201 | 201 | PASS |
| UPDATE-ehs_reviewer-Compliance | ehs_reviewer | Compliance | update | PATCH | `/api/compliance/13` | compliance:write | 200 | 200 | PASS |
| DELETE-ehs_reviewer-Compliance | ehs_reviewer | Compliance | delete | DELETE | `/api/compliance/23` | compliance:delete | 403 | 403 | PASS |
| REPORT-ehs_reviewer | ehs_reviewer | Reports | read | GET | `/api/reports/data` | reports:read | 200 | 200 | PASS |
| TECHREAD-ehs_reviewer | ehs_reviewer | Technology Selection | read | GET | `/api/technology` | technology:read | 200 | 200 | PASS |
| TECHWRITE-ehs_reviewer | ehs_reviewer | Technology Selection | update | PUT | `/api/technology` | technology:write | 403 | 403 | PASS |
| APPROVAL-ehs_reviewer | ehs_reviewer | Compliance | approval | PATCH | `/api/compliance/24` | compliance:write | 200 | 200 | PASS |
| USERSREAD-ehs_reviewer | ehs_reviewer | User Administration | read | GET | `/api/auth/users` | users:read | 403 | 403 | PASS |
| AUDITREAD-ehs_reviewer | ehs_reviewer | Audit Log | read | GET | `/api/audit` | audit:read | 200 | 200 | PASS |
| USERCREATE-ehs_reviewer | ehs_reviewer | User Administration | create | POST | `/api/auth/users` | users:write | 403 | 403 | PASS |
| USERUPDATE-ehs_reviewer | ehs_reviewer | User Administration | update | PATCH | `/api/auth/users/5` | users:write | 403 | 403 | PASS |
| USERRESET-ehs_reviewer | ehs_reviewer | User Administration | password reset | POST | `/api/auth/users/5/reset-password` | users:write | 403 | 403 | PASS |
| UNAUTH-01 | anonymous | /api/generation | authorization | GET | `/api/generation` | - | 401 | 401 | PASS |
| UNAUTH-02 | anonymous | /api/generation | authorization | POST | `/api/generation` | - | 401 | 401 | PASS |
| UNAUTH-03 | anonymous | /api/characterisation | authorization | GET | `/api/characterisation` | - | 401 | 401 | PASS |
| UNAUTH-04 | anonymous | /api/characterisation | authorization | POST | `/api/characterisation` | - | 401 | 401 | PASS |
| UNAUTH-05 | anonymous | /api/handling | authorization | GET | `/api/handling` | - | 401 | 401 | PASS |
| UNAUTH-06 | anonymous | /api/handling | authorization | POST | `/api/handling` | - | 401 | 401 | PASS |
| UNAUTH-07 | anonymous | /api/disposals | authorization | GET | `/api/disposals` | - | 401 | 401 | PASS |
| UNAUTH-08 | anonymous | /api/disposals | authorization | POST | `/api/disposals` | - | 401 | 401 | PASS |
| UNAUTH-09 | anonymous | /api/compliance | authorization | GET | `/api/compliance` | - | 401 | 401 | PASS |
| UNAUTH-10 | anonymous | /api/compliance | authorization | POST | `/api/compliance` | - | 401 | 401 | PASS |
| UNAUTH-11 | anonymous | /api/technology | authorization | GET | `/api/technology` | - | 401 | 401 | PASS |
| UNAUTH-12 | anonymous | /api/technology | authorization | PUT | `/api/technology` | - | 401 | 401 | PASS |
| UNAUTH-13 | anonymous | /api/reports/data | authorization | GET | `/api/reports/data` | - | 401 | 401 | PASS |
| UNAUTH-14 | anonymous | /api/auth/users | authorization | GET | `/api/auth/users` | - | 401 | 401 | PASS |
| UNAUTH-15 | anonymous | /api/audit | authorization | GET | `/api/audit` | - | 401 | 401 | PASS |
| INVALID-001 | anonymous | Reports | authorization | GET | `/api/reports/data` | - | 401 | 401 | PASS |
| AUDIT-DENIAL-001 | laboratory | Sludge Generation | denied attempt audit | DELETE | `/api/generation/16` | generation:delete | 403 and no audit row in enforcement mode | 403 and 0 audit row(s) | PASS |

### Findings

- **RBAC-F-001 [Low] Frontend has no per-route authorization guard** — App.jsx routes are registered unconditionally; Layout.jsx only filters navigation; AuthGate.jsx checks session/password only. A user with a valid session can open a module URL directly even when the backend denies its API calls. Fix: Add a route-level permission wrapper that redirects users without the corresponding read permission.
- **RBAC-F-002 [Low] Frontend can() helper fails open for users with no roles** — src/lib/permissions.js:34 returns true when roles are missing or empty. A malformed or role-less user object shows every navigation item. Fix: Default to no permissions when roles are absent or empty.
- **RBAC-F-003 [Medium] Enforcement-mode authorization denials are not audited** — auth._deny() records PERMISSION_DENIED only when AUTH_ENFORCEMENT=false; it raises immediately when true. Verified by AUDIT-DENIAL-001. Repeated denied access attempts leave no security audit trail in enforced deployments. Fix: Write a PERMISSION_DENIED audit row before raising 401/403 in enforcement mode.
- **RBAC-F-004 [Informational] Production configuration runs RBAC in shadow mode** — backend/app/config.py defaults AUTH_ENFORCEMENT to false and the live environment keeps that value. Unauthorized module requests are allowed through legacy require_permission endpoints in the current deployment; only strict auth/user/audit endpoints enforce. Fix: Enable AUTH_ENFORCEMENT=true in production after confirming monitoring and user readiness.

### Untested

- Browser-level UI behavior was not executed; frontend status is based on static source inspection and the exported permission helper.
- No standalone approval endpoint exists; compliance approval was tested through the status transition that emits APPROVAL audit records.
- Record-level ownership/tenant scoping does not exist in the API; only module-level permission scope was testable.
- Live production credentials and live production data were not used for authorization tests.

## 12. Completion-pass verification addendum (2026-11-27)

Scope: safe production-readiness completion after the baseline QA and RBAC audits. The project was not rebuilt or redesigned; the live database, live user accounts, roles, permissions, and `AUTH_ENFORCEMENT=false` were preserved. Browser automation remains unavailable.

### Executed verification

| Check | Result |
| --- | --- |
| Backend pytest suite after completion pass | `49 passed in 29.39s` |
| Production frontend build | `npm run build` succeeded in `10.42s`; no chunk exceeded 500 kB |
| Isolated end-to-end workflow | passed with synthetic generation, lab, handling, disposal and compliance records |
| Pure calculation assertions | passed |
| Live SQLite integrity / foreign-key check | `ok` / empty |
| Live auth mode | unchanged: `AUTH_ENFORCEMENT=false` |

### RBAC findings closed

- **RBAC-F-001** — Closed by a route-level permission wrapper in `src/App.jsx`; unauthorized module URLs redirect to the dashboard.
- **RBAC-F-002** — Closed in `src/lib/permissions.js`; an authenticated user with no roles and no explicit permissions fails closed, while anonymous legacy demo access is preserved.
- **RBAC-F-003** — Closed in `backend/app/auth.py`; enforcement-mode and shadow-mode denials both write `PERMISSION_DENIED` audit rows before the response is returned.
- **RBAC-F-004** — Remains open by design. Live shadow mode was not changed without approval.

### Additional completion fixes verified

- Partial PATCH endpoints now merge omitted fields and retain cross-field validation.
- Duplicate `sample_id`, `manifest_no`, and concurrent usernames now return `409`.
- Audit timestamp filters normalize aware timestamps to UTC.
- `/api/health` checks SQLite connectivity; `/api/reports/data` uses one atomic read transaction.
- Non-finite numeric values are rejected; compliance detail and note are bounded to 10,000 characters.
- Relative database paths resolve from the project root; wildcard CORS origins are ignored.
- Unhandled exceptions return a sanitized `500` response with a correlation ID and no exception text.
- Strict `401` responses include `WWW-Authenticate: Bearer`.
- `api.create()` no longer performs a second GET after POST.
- Handling forms clear edit state when another process group is selected.
- Dashboard disposal quantity uses the current reporting month.
- Report notes persist in this browser and remain excluded from exports by design.

### Remaining unverified or blocked

- Real-browser login, navigation, form interactions, PDF/CSV visual output, offline demo behavior, and responsive layout require a manual checklist because no browser engine is available.
- Live production-style deployment, HTTPS/proxy configuration, load testing, CI/CD, audit retention, offline synchronization, and PostgreSQL are not implemented or verified.
- Record-level ownership or tenant scoping is outside the current permission model.
- Do not enable `AUTH_ENFORCEMENT` or change live users, roles, or password flags without explicit approval.

## 13. Phase 2 Browser/Acceptance Pass (2026-11-28)

Status: **PARTIALLY EXECUTED — BROWSER NOT AVAILABLE**. Browser automation is unavailable in this workspace (`chromium`/`google-chrome`/`playwright` binaries not found; Python `playwright` not installed). No browser-rendered UI, downloaded PDF, or downloaded CSV was opened. All write acceptance checks were executed via FastAPI `TestClient` against an isolated temporary SQLite DB; the live DB hash was unchanged before and after.

### 13.1 Execution evidence

| Check | Method | Result |
| --- | --- | --- |
| Browser automation | `which chromium/google-chrome/playwright`; Python `playwright` import | **Unavailable** — no browser engine/binaries; `playwright_py False` |
| Live DB hash | `shasum -a 256` before/after isolated tests | Unchanged: `39c0c2ff45d7b747f18cf57dc4d90d375bdbb8b83322c67ff1317e4ebe84b444` |
| Auth mode | env/config inspection | `AUTH_ENFORCEMENT=false` unchanged |
| Isolated write tests | FastAPI `TestClient`, temp DB `/tmp/sludge-acceptance-*/acceptance.db`, `AUTH_ENFORCEMENT=false` | Executed; live DB not touched |
| Automated regression suites | `pytest backend/tests -q`, Node frontend tests, `npm run build` | 78 backend passed; 19 frontend Node passed; build passed (1.69s) |

### 13.2 Module PASS/FAIL matrix

| Module | Status | Evidence | Browser/PDF/CSV |
| --- | --- | --- | --- |
| 1. Authentication | **PARTIAL PASS** | Isolated API: `test_operator`, `test_laboratory`, `test_ehs_reviewer` login 200, `/me` roles correct, invalid credentials 401, optional password change 200 and login after change 200. RBAC: laboratory read generation 200. | **NOT EXECUTED**: browser redirect/navigation/role UI. `Gowtham` not in private credentials JSON (only 3 test-role entries present); live DB read-only shows `Gowtham` admin active — manual browser login required. |
| 2. Sludge Generation | **PASS (API/isolation)** | Isolated create 201, GET persistence, dry solids `64.96 kg`, rate `0.154667 kgDS/m³`, monthly `29120`, annual `349440`, latest record selection by date/id. | **NOT EXECUTED**: browser live-form interaction/refresh UI. |
| 3. Characterisation | **PASS (API/isolation)** | Isolated create 201, invalid pH rejected 422, record persisted in list, missing `cadmium_mgkg=null` preserved. | **NOT EXECUTED**: browser form/history UI. |
| 4. Sludge Handling | **PASS (API/isolation)** | Saved Thickening/Dewatering/Drying runs in isolated DB; ordering `Thickening, Dewatering, Drying`; each calc final mass `200 kg`, reduction `80%` for 1000 kg @94%→70%. | **NOT EXECUTED**: browser stage forms/refresh UI. |
| 5. Technology Selection | **PARTIAL PASS** | Isolated PUT `/api/technology` 200, GET persistence matched weights/scores. Dynamic ranking/recommendation logic covered by 9 Node tests. | **NOT EXECUTED**: browser weight sliders, normalize button, table search/sort, save/refresh UI. |
| 6. Compliance | **PARTIAL PASS** | Isolated create 201, PATCH status/note 200, invalid status 422, no regulatory thresholds invented. | **NOT EXECUTED**: browser UI, per-role navigation checks. RBAC write check in this ad-hoc script returned 201 for operator because `AUTH_ENFORCEMENT=false`; authoritative enforcement matrix is covered by automated RBAC tests (78-pass suite). |
| 7. Reports | **PARTIAL PASS** | Isolated `/api/reports/data` 200; snapshot includes created generation record. | **NOT EXECUTED**: PDF/CSV download, file open, row counts/units/dates/formatting visual inspection. Browser-generated exports only. |

### 13.3 Browser-tested functionality

**NOT EXECUTED**. No browser engine available. No claim is made for rendered login redirects, live calculation UI, form validation display, refresh/persistence UI, role navigation, PDF/CSV download/open, or responsive layout.

### 13.4 Automated test results

| Suite | Result |
| --- | --- |
| Backend `PYTHONPATH=backend python3 -m pytest backend/tests -q` | **78 passed in 11.50s** |
| Frontend `npm run test:generation` | **6 passed** |
| Frontend `npm run test:handling` | **4 passed** |
| Frontend `npm run test:technology` | **9 passed** |
| Build `npm run build` | **passed in 1.69s**, no chunk-size warning |
| Phase 2 isolated API acceptance script (temp DB) | **38 PASS, 3 FAIL, 1 BLOCKED, 3 NOT EXECUTED** (see defects/notes) |

### 13.5 PDF/CSV verification

**NOT EXECUTED**. No browser/PDF/CSV viewer available. Export implementation remains browser-side in `src/pages/Reports.jsx`: PDF via `jspdf` (`sludge-smart-report-YYYY-MM-DD.pdf`), CSV via `buildCsv`/blob download (`sludge-smart-report-YYYY-MM-DD.csv`), data from `GET /api/reports/data`. No PDF/CSV backend endpoints exist.

### 13.6 Remaining defects / notes

| Item | Severity | Detail |
| --- | --- | --- |
| Browser acceptance not run | Blocker for full signoff | No browser engine; all UI checks manual. |
| PDF/CSV not opened | Blocker for report signoff | Files not generated/opened; content/formatting unverified. |
| `Gowtham` credential missing from private JSON | Test data gap | Credentials file contains only `test_operator`, `test_laboratory`, `test_ehs_reviewer`; `Gowtham` admin login could not be API-tested in isolated pass. Live DB shows `Gowtham` active admin. |
| Ad-hoc RBAC write checks misleading under shadow mode | Test-script note | With `AUTH_ENFORCEMENT=false`, legacy write endpoints may return success; script recorded operator->compliance and lab->generation as FAIL statuses but these are shadow-mode behaviors, not enforcement failures. Authoritative RBAC covered by `test_rbac.py`/`test_final_qa.py`. |
| Report snapshot generation-id check in script | Test-script false negative | Snapshot included created generation record in follow-up check; initial script reported FAIL due selection logic. |
| `AUTH_ENFORCEMENT=false` | Known limitation | Do not enable without explicit approval. |

### 13.7 Exact manual steps for unverified items

**Preconditions:** browser available; do not modify live passwords/users; use isolated DB for writes (`SLUDGE_SMART_DB_PATH=/tmp/sludge-smart-acceptance/acceptance.db`, `AUTH_ENFORCEMENT=false`, backend 8011, frontend `VITE_API_URL=http://127.0.0.1:8011/api` on 5301).

1. **Auth/browser**: Login as `Gowtham`, `test_operator`, `test_laboratory`, `test_ehs_reviewer` with approved credentials. Expected: each lands on `/#/` Dashboard; no password-change redirect. Verify sidebar role, module visibility, and read-only badges per role. Try invalid password — expect rejection. Open Change Password as any user in isolated env — expect success and session still active.
2. **Generation**: Enter wastewater `420`, wet `1120`, moisture `94.2`, operating days `26`. Expected: live panel shows dry `64.96 kg/day`, rate `0.155 kgDS/m³` (display rounding), monthly `29120`, annual `349440`. Save, refresh, confirm record persists and Production Summary uses latest saved record.
3. **Characterisation**: Create sample with required fields and one missing metal (e.g., Cd empty). Expected: validation on invalid pH; save succeeds; refresh shows record; missing value displayed as missing/not fabricated.
4. **Handling**: Save one Thickening, one Dewatering, one Drying run (1000 kg, 94%→70%). Expected: final mass 200 kg, reduction 80%. Confirm table order Thickening/Dewatering/Drying, newest first within stage after refresh.
5. **Technology**: Change weights, click Normalise to 100 — total becomes 100. Edit scores 1–5; ranking/recommendation update. Save, refresh; confirm persisted. Search resource table by technology name/group.
6. **Compliance**: As ehs_reviewer/admin, create/edit checklist item and status; confirm persistence and validation. Verify operator/lab cannot write compliance in enforcement-enabled isolated run.
7. **Reports/PDF/CSV**: Select all sections, download CSV and PDF. Open files. Expected: CSV has all selected rows/headers, dates/units/counts match snapshot; PDF has A4 formatting, selected sections, and row-omission notice only when applicable. Confirm report note is excluded from exports.
8. **Cleanup**: Stop isolated servers, delete `/tmp/sludge-smart-acceptance`, recheck live DB hash/counts unchanged.

### 13.8 Isolated acceptance execution (API, 2026-11-28)

Executed with FastAPI `TestClient` on temp DB; no browser. Results: 38 PASS, 3 FAIL (script/shadow-mode artifacts), 1 BLOCKED (`Gowtham` credential absent from private JSON), 3 NOT EXECUTED (browser/PDF/CSV). Live DB hash unchanged after run. Full manual browser scenario remains **NOT EXECUTED**.

### 13.9 Known limitations and blockers

- Browser, PDF and CSV not executed/opened; manual signoff required.
- `AUTH_ENFORCEMENT=false` remains; shadow-mode behavior differs from enforcement.
- Private credentials JSON lacks `Gowtham`; admin browser/API login needs that credential.
- No live passwords/users/records modified; no commit/push.
