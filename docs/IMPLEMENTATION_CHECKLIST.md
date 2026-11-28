# SLUDGE SMART implementation checklist

Baseline: repository audit performed 2026-11-27 using `docs/FINAL_QA_REPORT.md` as the starting point. This checklist records the verified state before the completion pass. Statuses are evidence-based.

Status vocabulary:

- **Complete and verified** — executed test or read-only inspection proves behavior.
- **Implemented but unverified** — code exists; no executed test/browser check proves behavior.
- **Partially implemented** — some paths work; a required path is missing or unsafe.
- **Not implemented** — no implementation exists.
- **Broken or requiring correction** — demonstrated defect or security flaw.

## Complete and verified

- [x] Backend CRUD, filters, PATCH, strict ISO dates and legacy response shapes — `42 passed` in the current test suite.
- [x] SQLite schema, additive migrations, FKs, indexes, append-only audit triggers and integrity checks — read-only DB audit and migration tests.
- [x] PBKDF2 password hashing, opaque bearer sessions, revocation, expiry and lockout core logic — isolated backend tests.
- [x] Role-permission matrix seeded from migrations; 4 roles, 21 permissions — read-only DB audit.
- [x] API-level RBAC in enforcement mode — 134/134 simulated cases passed in isolated temp DB.
- [x] Frontend permission helper matrix matches backend matrix for all roles/permissions — exported helper comparison.
- [x] Pure calculation functions for generation, handling, technology ranking, screening flags and missing parameters — Node assertion script passed.
- [x] Production build — `npm run build` succeeded without the previous large-chunk warning.
- [x] Audit rows written in the same transaction as business writes; sensitive keys redacted — audit tests.
- [x] Live DB integrity and foreign-key checks — `ok` and empty.
- [x] Live user accounts and role assignments preserved — read-only verification.

## Complete and verified after completion pass

- [x] Enforcement and shadow-mode permission denials write `PERMISSION_DENIED` audit rows — isolated API regression test.
- [x] Strict `401` responses include `WWW-Authenticate: Bearer` and access denials are audited — code inspection and `49 passed` backend suite.
- [x] Frontend route-level RBAC guards all seven module routes and redirects unauthorized access — production build succeeded.
- [x] `can()` fails closed for role-less authenticated users while preserving anonymous legacy demo access — production build succeeded.
- [x] Relative `SLUDGE_SMART_DB_PATH` resolves from project root; wildcard CORS origins are ignored — regression test.
- [x] Business PATCH endpoints merge omitted fields and preserve cross-field validation — regression tests.
- [x] `sample_id` and `manifest_no` duplicates return `409`; username race condition returns `409` — regression tests.
- [x] Numeric fields reject non-finite values; compliance detail and note are bounded — backend suite.
- [x] `/api/health` verifies SQLite connectivity and returns `503` when unavailable — regression test.
- [x] `/api/reports/data` reads from one atomic transaction — code inspection and backend suite.
- [x] Audit timestamp filters normalize aware timestamps to UTC — backend suite.
- [x] Sanitized global `500` handler never returns exception text — regression test.
- [x] `api.create()` no longer performs a second GET after POST — production build succeeded.
- [x] Handling forms clear edit state when another group is selected — production build succeeded.
- [x] Dashboard disposal metric uses the current reporting month — production build succeeded.
- [x] Report note persists locally and is explicitly excluded from exports — production build succeeded.
- [x] Isolated end-to-end workflow with synthetic records across generation, characterisation, handling, disposal and compliance — regression test passed.
- [x] Backend suite after completion pass — `49 passed in 29.39s`.
- [x] Production build after completion pass — `npm run build` succeeded in `10.42s` without large-chunk warnings.

## Implemented but unverified

- [ ] Browser login/logout for each role.
- [ ] Browser navigation and direct-URL behavior for all seven modules.
- [ ] Form interactions, dialogs, inline messages and responsive layout in a real browser.
- [ ] Dashboard visual rendering and live refresh after record creation.
- [ ] PDF and CSV visual output and downloaded file contents.
- [ ] Offline/demo-mode behavior from the browser.
- [ ] Latency, concurrency and resource usage under realistic load.
- [ ] Live production-style deployment (HTTPS, proxy, supervisor, monitoring).

## Partially implemented

- [ ] Offline write workflow: local records are created, but there is no server synchronization or conflict resolution.
- [ ] API schema strictness: password change forbids extra fields; other schemas ignore extras.

## Not implemented

- [ ] PostgreSQL/shared database deployment.
- [ ] Audit retention, archive and purge policy.
- [ ] CI/CD pipeline and automated frontend/browser test suite.
- [ ] Load testing and production scalability evidence.
- [ ] Record-level ownership or tenant scoping beyond module-level permissions.
- [ ] Configurable jurisdiction-specific regulatory thresholds.
- [ ] Offline-to-online synchronization.
- [ ] Automated database backup job (procedure is documented only).

## Remaining constraints requiring user decision

- [ ] `AUTH_ENFORCEMENT=false` remains live shadow mode; legacy business APIs are usable anonymously. Do not change without approval.
- [ ] Live users, roles, permissions and password-change flags are unchanged except the two previously authorized accounts. Do not modify without approval.
- [ ] Browser automation is unavailable; browser-level checks must be performed manually.

## Completion-pass evidence

1. Security defects that do not weaken access controls: denial auditing, route guard, fail-open permission helper, strict 401 header.
2. Integration/data defects: absolute DB path default, wildcard CORS filtering, atomic report snapshot, partial PATCH behavior, duplicate checks, finite-number validation, bounded compliance text, health DB check, sanitized 500 handler.
3. Frontend interaction defects: create-after-write, handling edit state, dashboard month metric, report note persistence.
4. Regression tests added to `backend/tests/test_completion_fixes.py`.
5. Final verification: backend suite and production build passed; remaining browser/live-deployment items reported honestly.
