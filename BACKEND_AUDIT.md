# SLUDGE SMART — Phase 1 Backend Audit

> **Historical snapshot.** This file records the pre-implementation backend audit and is retained for traceability only. It does not describe the current code. For current behaviour, use `docs/ARCHITECTURE.md`, `docs/API_DOCUMENTATION.md`, `docs/AUTHENTICATION.md`, `docs/RBAC.md`, `docs/AUDIT_LOGGING.md`, `docs/DATABASE_SCHEMA.md` and `docs/DATABASE_MIGRATIONS.md`.

**Date:** 2026-11-27  
**Scope:** `backend/app/{main,db,routers,schemas}.py`, `backend/requirements.txt`, `start.py`, `shared/sample-data.json`, `src/**` (connectivity only), `vite.config.js`, `package.json`, repository config.  
**Method:** Static source inspection and read-only filesystem checks. No application file was modified, no package was installed, no database was created, changed or deleted. The `data/` directory is absent in this checkout (it is git-ignored), so the database audit is based on the authoritative schema in `backend/app/db.py:19-90` plus the seed data file.

---

## 1. Existing implementation

### 1.1 FastAPI application structure
- Single app instance created in `backend/app/main.py:18-23` with title `SLUDGE SMART API`, version `1.0.0`.
- Startup is managed by an `asynccontextmanager` lifespan (`main.py:12-15`) that calls `db.init_db()` once at boot; no shutdown logic.
- One `APIRouter(prefix="/api")` is defined in `backend/app/routers.py:21` and included once in `main.py:33`.
- No `Depends`, middleware (other than CORS), exception handlers, background tasks, or API versioning prefix beyond `/api`.
- `backend/app/__init__.py` is empty; no package-level configuration.

### 1.2 Router organisation
`routers.py` is a single 193-line module grouped by comment blocks rather than separate routers:

| Group | Lines | Tables |
|---|---|---|
| Health | 30-32 | none |
| Module 02 — generation | 38-52 | `generation_records` |
| Module 03 — characterisation | 58-72 | `lab_records` |
| Module 04 — handling | 78-92 | `handling_runs` |
| Disposal | 98-112 | `disposal_records` |
| Module 06 — compliance | 118-141 | `compliance_items` |
| Module 05 — technology settings | 147-177 | `technology_settings` |
| Dashboard/report aggregation | 183-193 | all of the above |

`require_found()` at `routers.py:24-27` is the only shared helper and produces `{"detail": "<Label> not found"}` with status 404.

### 1.3 Database connection management
- `db.py:15-17` resolves `ROOT` to the project root and fixes `DB_PATH = <root>/data/sludge_smart.db`, `SAMPLE_PATH = <root>/shared/sample-data.json`. Both are constants; no environment override.
- `connect()` (`db.py:93-98`) creates a **new** `sqlite3.Connection` on every call, sets `row_factory = sqlite3.Row`, `PRAGMA foreign_keys = ON`, and `timeout=10`. It does **not** explicitly close connections; all callers use `with connect() as conn:`, which commits/rolls back the transaction but leaves the connection object to garbage collection.
- Generic helpers: `fetch_all`, `fetch_one` (`db.py:175-183`), `insert`, `update`, `delete` (`db.py:186-208`). All values are bound parameters; table names and column names are interpolated with f-strings from **internal caller-supplied strings**.
- `insert()` re-reads the row with a second connection after committing; `update()` likewise. The read is not part of the write transaction.
- `init_db()` (`db.py:101-115`) executes `CREATE TABLE IF NOT EXISTS` statements and seeds only when **all five** data tables are empty.
- `seed()` (`db.py:118-172`) loads `shared/sample-data.json`, inserts records with `source='sample'`, inserts 12 compliance items with explicit IDs 1-12, and writes `technology_settings` with `INSERT OR REPLACE`.

### 1.4 Pydantic schemas
`backend/app/schemas.py` defines seven request models (Pydantic 2):

| Model | Fields / validation |
|---|---|
| `GenerationIn` (17-27) | `date` (ISO validator), `wastewater_m3 > 0 ≤ 1e6`, `wet_sludge_kg > 0 ≤ 1e7`, `moisture_pct 0–<100`, `operating_days > 0 ≤ 31` |
| `LabIn` (30-48) | `date`, `sample_id 1–64`, pH 0–14, percentages 0–100, non-negative analytes, `other_contaminants ≤ 500`, all analytes nullable |
| `HandlingIn` (51-70) | `date`, `process_group`/`technology` 1–64, `initial_mass_kg > 0`, moisture ranges, cross-field rule `final_moisture_pct ≤ initial_moisture_pct` |
| `DisposalIn` (73-83) | `date`, `quantity_kg > 0`, `facility 1–160`, `manifest_no 1–80`, `transport_mode ≤ 80` |
| `CompliancePatch` (86-90) | nullable `status` literal (3 states), `detail`, `note`, `due_date` — no length/date validation on the last three |
| `ComplianceCreate` (93-99) | `area 1–120`, `requirement 1–500`, `detail`/`note` free text, `status` literal, unvalidated `due_date` |
| `TechnologySettingsIn` (102-104) | `weights: dict[str, float]`, `scores: dict[str, dict[str, float]]` — no key/value constraints |

`valid_date()` (`schemas.py:9-14`) uses `date.fromisoformat` and rejects non-ISO strings with a readable message. No model sets `model_config = ConfigDict(extra="forbid")`.

### 1.5 Dependencies
`backend/requirements.txt` contains exactly three pinned packages:

```
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
```

Absent: SQLAlchemy, Alembic, bcrypt/passlib, PyJWT/python-jose, python-multipart, pytest/httpx, any ASGI auth or rate-limit middleware. `start.py:17-29` launches uvicorn on `127.0.0.1:8000` and Vite on port 5300; Vite binds `0.0.0.0` (`vite.config.js:6-7`).

### 1.6 Error handling
- FastAPI/Pydantic defaults produce HTTP 422 with field-level detail for validation failures.
- Explicit `HTTPException` uses: 404 for missing records (`routers.py:24-27`, 50-52, 70-72, 90-92, 110-112, 139-141), 400 for an empty compliance patch (`routers.py:131-132`).
- No global exception handler, no logging module usage, no correlation/request IDs, no structured error envelope, no retry or rate-limit responses. Error detail strings are inconsistent ("Record not found", "Run not found", "Item not found").
- The frontend API client converts any non-2xx response into an `Error` and then **swallows it**, falling back to browser-local state (`src/lib/api.js:83-101, 108-112, 123-128, 137-154`).

### 1.7 CORS configuration
`main.py:25-31`: `allow_origins=["*"]`, `allow_credentials=False`, `allow_methods=["*"]`, `allow_headers=["*"]`. There is no origin allowlist and no `VARY`/`max_age` tuning. Browser access from arbitrary origins is permitted for GET, POST, PUT, PATCH and DELETE.

---

## 2. API audit — every endpoint

All 20 routes are unauthenticated. Responses are raw JSON dicts/lists produced by `SELECT *` (or the technology normaliser); there is no response model, so column order/content is the de-facto contract.

| # | Method | Path | Request schema | Success response | Error responses |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | — | `200 {"status":"ok","database":"<absolute path>"}` | — |
| 2 | GET | `/api/generation` | — | `200 list[generation_records rows]` ordered `date DESC, id DESC` | — |
| 3 | POST | `/api/generation` | `GenerationIn` | `201` inserted row incl. `id`, `source="user"`, `created_at` | 422 |
| 4 | DELETE | `/api/generation/{record_id}` | path `int` | `200 {"deleted": <id>}` | 404 `Record not found`, 422 |
| 5 | GET | `/api/characterisation` | — | `200 list[lab_records rows]` | — |
| 6 | POST | `/api/characterisation` | `LabIn` | `201` inserted row | 422 |
| 7 | DELETE | `/api/characterisation/{record_id}` | path `int` | `200 {"deleted": <id>}` | 404, 422 |
| 8 | GET | `/api/handling` | — | `200 list[handling_runs rows]` | — |
| 9 | POST | `/api/handling` | `HandlingIn` | `201` inserted row | 422 |
| 10 | DELETE | `/api/handling/{record_id}` | path `int` | `200 {"deleted": <id>}` | 404 `Run not found`, 422 |
| 11 | GET | `/api/disposals` | — | `200 list[disposal_records rows]` | — |
| 12 | POST | `/api/disposals` | `DisposalIn` | `201` inserted row | 422 |
| 13 | DELETE | `/api/disposals/{record_id}` | path `int` | `200 {"deleted": <id>}` | 404, 422 |
| 14 | GET | `/api/compliance` | — | `200 list[compliance_items rows]` ordered `id` | — |
| 15 | POST | `/api/compliance` | `ComplianceCreate` | `201` inserted row | 422 |
| 16 | PATCH | `/api/compliance/{record_id}` | `CompliancePatch` | `200` updated row with local-second `updated_at` | 400 `No fields to update`, 404 `Item not found`, 422 |
| 17 | DELETE | `/api/compliance/{record_id}` | path `int` | `200 {"deleted": <id>}` | 404 `Item not found`, 422 |
| 18 | GET | `/api/technology` | — | `200 {"weights":{...},"scores":{...},"updated_at":str\|null}`; falls back to sample config when no row exists (`routers.py:147-156`) | — |
| 19 | PUT | `/api/technology` | `TechnologySettingsIn` | `200` normalised settings object (same shape as #18) | 422 |
| 20 | GET | `/api/reports/data` | — | `200 {"generation":[...],"characterisation":[...],"handling":[...],"disposals":[...],"compliance":[...],"technology":{...},"generated_at":"<local iso seconds>"}` | — |

Interactive docs are auto-exposed at `/docs`, `/redoc` and `/openapi.json` (FastAPI default; not disabled).

### 2.1 Frontend module connectivity

All seven modules are present (`src/App.jsx:16-22`, `src/components/Layout.jsx:5-13`) and all are wired to the API through `src/lib/api.js`:

| Module | Frontend file | Backend calls | Status |
|---|---|---|---|
| 01 Dashboard | `pages/Dashboard.jsx:10-13` | GET generation, characterisation, disposals, compliance | Connected |
| 02 Sludge Generation | `pages/Generation.jsx:25,54,165` | GET/POST/DELETE `/generation` | Connected |
| 03 Characterisation | `pages/Characterisation.jsx:34,56,145` | GET/POST/DELETE `/characterisation` | Connected |
| 04 Sludge Handling | `pages/Handling.jsx:66,119,187` | GET/POST/DELETE `/handling` | Connected |
| 05 Technology Selection | `pages/Technology.jsx:9-10,45` | GET/PUT `/technology`, GET `/generation` | Connected |
| 06 Compliance | `pages/Compliance.jsx:11-12,31,49,117,133,141,190` | GET/POST/PATCH/DELETE `/compliance`, GET/POST/DELETE `/disposals` | Connected |
| 07 Reports | `pages/Reports.jsx:4,224` | `reportData()` in `api.js:157-165` — six individual GETs, **not** `/api/reports/data` | Connected, but the aggregation endpoint is unused |

`src/lib/api.js:6-12` maps the frontend names to backend paths. `/api/health` and `/api/reports/data` are the two endpoints with no frontend consumer. There is no login/logout call anywhere in `src/`.

**Compatibility notes:** the frontend always merges negative-ID, `source="user"` records from `localStorage` into server responses (`api.js:69-87`); deleting a local record uses strict `id !== id` comparison; and any HTTP error (including a future 401/403) is treated as "offline" and the write is silently applied only in the browser. This is the single largest compatibility risk for introducing authentication without touching the frontend.

---

## 3. Database audit

### 3.1 On-disk state
`data/` does not exist in this checkout and `.gitignore:11` excludes it. No SQLite file was present or opened during this audit. The database is created on first backend start by the lifespan hook. No records were read from or written to a live database.

### 3.2 Tables, columns and constraints

All six tables are created with `CREATE TABLE IF NOT EXISTS` (`db.py:19-90`).

**`generation_records`** — `id INTEGER PRIMARY KEY AUTOINCREMENT`, `date TEXT NOT NULL`, `wastewater_m3 REAL NOT NULL`, `wet_sludge_kg REAL NOT NULL`, `moisture_pct REAL NOT NULL`, `operating_days REAL NOT NULL`, `source TEXT NOT NULL DEFAULT 'user'`, `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

**`lab_records`** — `id INTEGER PRIMARY KEY AUTOINCREMENT`, `date TEXT NOT NULL`, `sample_id TEXT NOT NULL`, `ph REAL`, `moisture_pct REAL`, `total_solids_pct REAL`, `volatile_solids_pct REAL`, `oil_grease_mgkg REAL`, `cod_mgl REAL`, `lead_mgkg REAL`, `chromium_mgkg REAL`, `cadmium_mgkg REAL`, `nickel_mgkg REAL`, `other_contaminants TEXT NOT NULL DEFAULT ''`, `source TEXT NOT NULL DEFAULT 'user'`, `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

**`handling_runs`** — `id INTEGER PRIMARY KEY AUTOINCREMENT`, `date TEXT NOT NULL`, `process_group TEXT NOT NULL`, `technology TEXT NOT NULL`, `initial_mass_kg REAL NOT NULL`, `initial_moisture_pct REAL NOT NULL`, `final_moisture_pct REAL NOT NULL`, `source TEXT NOT NULL DEFAULT 'user'`, `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

**`disposal_records`** — `id INTEGER PRIMARY KEY AUTOINCREMENT`, `date TEXT NOT NULL`, `quantity_kg REAL NOT NULL`, `facility TEXT NOT NULL`, `manifest_no TEXT NOT NULL`, `transport_mode TEXT NOT NULL DEFAULT ''`, `source TEXT NOT NULL DEFAULT 'user'`, `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

**`compliance_items`** — `id INTEGER PRIMARY KEY AUTOINCREMENT`, `area TEXT NOT NULL`, `requirement TEXT NOT NULL`, `detail TEXT NOT NULL DEFAULT ''`, `status TEXT NOT NULL DEFAULT 'Information missing'`, `due_date TEXT`, `note TEXT NOT NULL DEFAULT ''`, `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

**`technology_settings`** — `id INTEGER PRIMARY KEY CHECK (id = 1)` (enforced single row), `weights TEXT NOT NULL` (JSON), `scores TEXT NOT NULL` (JSON), `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`.

### 3.3 Keys, constraints and indexes
- **Primary keys:** integer surrogate `id` on five tables; fixed `id = 1` on `technology_settings`.
- **Foreign keys:** none declared anywhere. `PRAGMA foreign_keys = ON` (`db.py:97`) is therefore inert today.
- **Unique constraints:** none. `sample_id` and `manifest_no` are not unique; duplicate consignments/samples are possible.
- **Check constraints:** only `id = 1` on `technology_settings`. `source` and `status` have no database-level CHECK; the `status` literal is enforced only by Pydantic.
- **Indexes:** only implicit indexes for `INTEGER PRIMARY KEY`/AUTOINCREMENT. No explicit indexes on `date`, `source`, `sample_id`, `manifest_no`, `status` or timestamps. Fine at current data volume; will degrade as records grow.
- **Defaults:** `source='user'`, timestamps via SQLite `CURRENT_TIMESTAMP` (UTC). The compliance PATCH writes `datetime.now().isoformat(timespec="seconds")` (`routers.py:133`), a naive local timestamp — inconsistent with DB defaults and with `/api/reports/data`.

### 3.4 Initialisation and sample data
- `init_db()` is idempotent for schema but its seeding condition is coarse: it seeds **all** five content tables only when **all** are empty. A partially populated database never receives sample data, and `technology_settings` is only reseeded inside that same branch.
- `seed()` uses explicit named parameters for all sample inserts; only table/column literals are hardcoded. Sample rows are tagged `source='sample'`; user rows are tagged `source='user'` by the routers.
- `shared/sample-data.json` contains 14 generation, 10 lab, 8 handling, 6 disposal, 12 compliance records and a 9-criterion/10-technology scoring matrix. Compliance sample rows are inserted with explicit IDs 1-12, which consumes AUTOINCREMENT sequence values.
- If no `technology_settings` row exists, GET `/api/technology` transparently returns the sample matrix with `updated_at: null` without writing to the database.
- There is no migration framework, no schema version table, and no backup logic.

---

## 4. Security findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| S-01 | **Critical** | No authentication on any of the 20 endpoints. Anyone who can reach port 8000 can read, create, modify and delete all records, including disposal manifests and compliance status. | `main.py` (no dependencies), `routers.py` (no auth params) |
| S-02 | **Critical** | No role-based access control. Technology weights/scores (decision matrix) and all DELETE operations are as accessible as reads. | `routers.py:43-52, 83-92, 103-112, 137-141, 164-177` |
| S-03 | **High** | Wildcard CORS with all methods/headers. Any web origin can issue cross-origin DELETE/PUT requests. `allow_credentials=False` limits cookie abuse today, but a Bearer token obtained by script would be usable from anywhere. | `main.py:25-31` |
| S-04 | **High** | `/api/health` discloses the absolute server-side database path, aiding local file reconnaissance. | `routers.py:30-32` |
| S-05 | **High** | Generic DB helpers interpolate table and column identifiers into SQL strings. Safe with today's hardcoded callers, but a latent SQL-injection path if any caller ever passes user-derived keys. `fetch_all` also accepts an arbitrary raw SQL string. | `db.py:175-208` |
| S-06 | **Medium** | No audit trail: no way to attribute a change, reconstruct previous values, or detect tampering with compliance status or technology scores. | schema in `db.py:19-90` |
| S-07 | **Medium** | Input validation gaps: unknown extra fields are silently accepted/ignored; `CompliancePatch.detail/note/due_date` and `ComplianceCreate.detail/note/due_date` are unbounded/unvalidated; `TechnologySettingsIn` accepts arbitrary keys and unbounded weights/scores, which can corrupt the ranking UI; no DB uniqueness on `sample_id`/`manifest_no`. | `schemas.py:86-104`, `db.py:31-71` |
| S-08 | **Medium** | Frontend treats every API error as "offline", so a future 401/403 would cause writes to be stored only in `localStorage` while the UI reports success. Data would silently diverge from the server. | `src/lib/api.js:83-101, 108-112, 123-128` |
| S-09 | **Medium** | No rate limiting or lockout. Once login exists, brute-force attempts against `/api/auth/login` would be unrestricted. | no middleware in `main.py` |
| S-10 | **Medium** | Connection lifecycle: `connect()` connections are never explicitly closed; read-after-write uses a second connection outside the write transaction, so returned rows are not guaranteed under concurrency. | `db.py:93-98, 186-208` |
| S-11 | **Low** | No file-upload endpoint and no server-side file handling exist (PDF/CSV generation is client-side via jsPDF/Blob). No current upload attack surface; any future upload feature must be designed with type/size validation and non-executable storage. | `src/pages/Reports.jsx`, `routers.py` |
| S-12 | **Low** | No secrets or credentials are committed; `.env` and `.env.*` are git-ignored. However there is no configuration mechanism for a future signing secret or bootstrap admin credential, and no env template. | `.gitignore:15-17`, source inspection |
| S-13 | **Low** | SQLite file has no encryption at rest and relies on OS file permissions; `data/` is not permission-hardened by code. | `db.py:16, 93-98` |
| S-14 | **Low** | Uvicorn is launched on loopback by `start.py`, but Vite binds `0.0.0.0`; manual uvicorn invocations could expose the unauthenticated API on a LAN. | `start.py:19`, `vite.config.js:6-7` |

---

## 5. Confirmed deficiencies (functional / engineering, non-security)

1. `/api/reports/data` is implemented but unused by the UI; `src/lib/api.js:157-165` re-implements the aggregation with six separate requests, so the two code paths can drift.
2. `/api/health` and `/api/reports/data` have no consumer; `/docs`, `/redoc`, `/openapi.json` are publicly exposed by default.
3. Timestamps mix UTC SQLite defaults with naive local time from `datetime.now()` (`routers.py:133, 166, 192`).
4. No response models: API shape is tied to `SELECT *`, so adding a column to an existing table changes the response format (relevant to the constraint that formats must not change).
5. No tests of any kind: no `tests/` directory, no `pytest`/`httpx` dependency, no `conftest.py`, no CI configuration.
6. No logging or observability: failed writes, validation errors and seeding outcomes are not recorded.
7. Seeding is all-or-nothing across five tables; partial data blocks sample initialisation.
8. `fetch_all`/`fetch_one`/`insert`/`update`/`delete` open a new connection per call with no explicit close and no shared transaction boundary.
9. `init_db()` runs on every startup; although `CREATE TABLE IF NOT EXISTS` is safe, there is no migration/version tracking to coordinate future additive schema changes.
10. No `NOT NULL` bound on nullable lab analytes in the DB; Pydantic permits all-null lab rows, which the UI must handle.

---

## 6. API compatibility findings

- **Response shapes must be preserved.** Phase 1 must not add fields to existing responses. Do **not** add `created_by`/`updated_by` columns to existing tables while routes use `SELECT *`; keep attribution in the new `audit_logs` table only. If columns are eventually needed, switch to explicit `SELECT` column lists in a separately versioned change.
- **New endpoints are additive.** Login/logout/me and audit-read endpoints can be introduced without altering existing contracts.
- **Attaching `Depends` to existing route functions** does not change success responses; 401/403 use FastAPI's existing `{"detail": ...}` error shape, consistent with current 404/400 errors.
- **The frontend cannot currently distinguish 401/403 from network failure.** With the no-frontend-change constraint, Phase 1 should enforce new permissions in a configurable *observe-only/shadow* mode first (log denials, allow the request), then switch to enforcement when a frontend update is authorised. Enforcing immediately will cause silent local-only writes and an "API CONNECTED" indicator that contradicts reality.
- Token transport should be `Authorization: Bearer` (header) rather than cookies, because `allow_credentials=False` is already in place and the frontend's `request()` helper (`api.js:44-67`) forwards `options.headers`. Injecting the header at Phase 1 would require a frontend change; therefore token issuance can be built first, with header injection scheduled alongside the frontend integration.
- `source='user'` and negative client IDs are part of the de-facto UI contract; audit records must use the authenticated user id, never a client-supplied actor field.

---

## 7. Prioritised improvements

**P0 — before any further deployment**
1. Implement authentication (login/logout/session validation, hashed passwords) — S-01, S-09.
2. Implement RBAC for all four roles with deny-by-default checks — S-02.
3. Add the append-only audit log and record all create/update/delete/auth events — S-06.
4. Add additive, versioned migrations with a pre-migration backup step; never drop or rewrite existing tables — §3.4.

**P1 — immediately after P0**
5. Replace wildcard CORS with an explicit origin allowlist; keep `allow_credentials=False` with Bearer tokens — S-03.
6. Remove the absolute DB path from `/api/health`; return `{"status":"ok","database":"connected"}` only after a real connectivity check (new health shape is a deliberate exception to be agreed, since it is unused by the frontend) — S-04.
7. Enforce table/column allowlists in `db` helpers and remove the raw-SQL entry point from any future public use — S-05.
8. Add validation hardening: `extra="forbid"`, bounds on patch fields and technology weights/scores, ISO validation for `due_date`, UNIQUE indexes for `sample_id`/`manifest_no` where business rules permit — S-07.

**P2 — hardening and quality**
9. Explicit connection close or a small connection-manager refactor; single transaction for read-modify-write + audit insert — S-10.
10. Standardise UTC timestamps (`datetime.now(timezone.utc).isoformat()`).
11. Add tests and CI (see §8), including migration tests on a **copy** of the database.
12. Add per-IP login rate limiting and account lockout; redact secrets from logs.
13. Reconcile `/api/reports/data` usage with the frontend aggregation in a later, separately approved change.

---

## 8. Testing audit

**Existing:** none. No `tests/`, no `pytest.ini`/`pyproject.toml`/`setup.cfg`, no `conftest.py`, no test files, no CI workflow. `requirements.txt` has no test tooling; `package.json` has no test script.

**Missing coverage (Phase 1 baseline):**
- Every one of the 20 endpoints: success shape, 422 validation, 404/400 paths, ordering, `source` tagging.
- Schema edge cases: cross-field moisture rule, ISO dates, nullable lab analytes, status literal enforcement, extra-field rejection, technology key/value bounds.
- DB helpers: parameter binding, identifier allowlists, transaction rollback, connection cleanup, seed idempotency on an empty DB and non-seeding on a partially populated DB.
- Migration: additive schema creation against a **copy** of a populated DB, idempotent re-run, no row loss, rollback-from-backup procedure.
- New Phase 1 features: password hashing vector and constant-time verification; login success/failure/lockout; token expiry and revocation on logout; role-permission matrix for every endpoint; audit row contents (actor, action, table, record id, before/after JSON, timestamp); audit append-only enforcement; shadow-mode denial logging.
- Frontend compatibility contract (can be asserted server-side): response keys remain unchanged for all existing endpoints.

Recommended tooling (to be approved before implementation; not installed during this audit): `pytest`, `httpx`, `pytest-cov`; tests use a temporary copied SQLite file via an env override of `DB_PATH`, never the live `data/sludge_smart.db`.

---

## 9. Detailed Phase 1 implementation plan

All changes are **additive** to the backend only. Existing endpoint paths, request models, success response keys and existing table definitions remain unchanged. No frontend file is modified.

### 9.1 Database prerequisites
1. Introduce `backend/migrations/001_phase1.sql` and a tiny migration runner invoked from the lifespan after `db.init_db()`. Track applied versions in `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`.
2. Operational step before the first migration on any populated system: copy `data/sludge_smart.db` to a timestamped backup under `data/backups/`. The migration itself must contain no `DROP`, no `DELETE`, and no `ALTER` of existing tables.
3. Make `DB_PATH` overridable by an environment variable (e.g. `SLUDGE_SMART_DB_PATH`) so tests can target a temporary copy. Default stays `<root>/data/sludge_smart.db`.
4. New tables (all `IF NOT EXISTS`, `PRAGMA foreign_keys = ON`):

   - `users`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `username TEXT NOT NULL UNIQUE`, `password_hash TEXT NOT NULL`, `full_name TEXT NOT NULL DEFAULT ''`, `email TEXT NOT NULL DEFAULT ''`, `is_active INTEGER NOT NULL DEFAULT 1`, `failed_attempts INTEGER NOT NULL DEFAULT 0`, `locked_until TEXT`, `last_login_at TEXT`, `must_change_password INTEGER NOT NULL DEFAULT 1`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`.
   - `roles`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL UNIQUE` (`administrator`, `operator`, `laboratory`, `ehs_reviewer`), `description TEXT NOT NULL DEFAULT ''`.
   - `permissions`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `code TEXT NOT NULL UNIQUE`, `description TEXT NOT NULL DEFAULT ''`. Codes use `resource:action`, e.g. `generation:read/write/delete`, `lab:read/write/delete`, `handling:*`, `disposal:*`, `compliance:read/write`, `technology:read/write`, `audit:read`, `user:manage`, `reports:read`.
   - `user_roles`: `user_id INTEGER NOT NULL REFERENCES users(id)`, `role_id INTEGER NOT NULL REFERENCES roles(id)`, `PRIMARY KEY (user_id, role_id)`.
   - `role_permissions`: `role_id INTEGER NOT NULL REFERENCES roles(id)`, `permission_id INTEGER NOT NULL REFERENCES permissions(id)`, `PRIMARY KEY (role_id, permission_id)`.
   - `sessions`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `token_hash TEXT NOT NULL UNIQUE` (SHA-256 of the opaque token; never store raw tokens), `user_id INTEGER NOT NULL REFERENCES users(id)`, `created_at TEXT NOT NULL`, `expires_at TEXT NOT NULL`, `revoked_at TEXT`, `last_seen_at TEXT`. Indexes on `token_hash`, `expires_at`, `user_id`.
   - `audit_logs`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `timestamp TEXT NOT NULL` (UTC ISO-8601), `actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`, `actor_username TEXT NOT NULL`, `action TEXT NOT NULL` (`CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `PERMISSION_DENIED`), `resource TEXT NOT NULL` (table name or `auth`), `record_id TEXT`, `before_values TEXT`, `after_values TEXT`, `changed_fields TEXT`, `outcome TEXT NOT NULL DEFAULT 'success'`, `detail TEXT NOT NULL DEFAULT ''`, `ip_address TEXT`, `user_agent TEXT`, `request_id TEXT`. Indexes on `timestamp`, `(resource, record_id)`, `actor_user_id`, `action`.
5. Seed roles, permissions and role→permission links with `INSERT OR IGNORE` on every startup (idempotent). Do not seed any user credentials into source control.
6. Bootstrap the first administrator from an environment variable containing a **pre-hashed** password, or via a one-time CLI command that prompts interactively; set `must_change_password=1`. No default/shared password.

### 9.2 A. Authentication
1. New schemas in `schemas.py`: `LoginIn(username, password)`, `PasswordChangeIn(current_password, new_password)`, and response models for the new endpoints only (`TokenOut`, `UserOut`).
2. Password hashing with available stdlib only: `hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)` with a fresh 16-byte `os.urandom` salt and ≥ 300,000 iterations; storage format `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`; verification with `hmac.compare_digest`. If the project later approves `bcrypt`/`passlib`, isolate this behind a `hash_password`/`verify_password` interface so storage can be upgraded with a rehash-on-login strategy. Never log passwords or raw tokens.
3. New endpoints, all additive:
   - `POST /api/auth/login` → `200 {"access_token": "...", "token_type": "bearer", "expires_at": "..."}`; verifies active user, constant-time password check, increments failed attempts with lockout, writes a `LOGIN`/`LOGIN_FAILED` audit row, stores only the token hash in `sessions`.
   - `POST /api/auth/logout` → `200 {"logged_out": true}`; requires a valid token, sets `revoked_at`; writes a `LOGOUT` audit row. Idempotent for already-revoked tokens.
   - `GET /api/auth/me` → current user identity and role names (no password hash or token hash).
   - `POST /api/auth/change-password` → authenticated password change, revokes other sessions for that user, writes an audit row with no password values.
4. Token format: opaque `secrets.token_urlsafe(32)` (no JWT library needed), 8-hour expiry, single active session revocation supported, constant-time hash lookup. Transport via `Authorization: Bearer <token>`; no cookies, so `allow_credentials=False` remains valid.
5. Dependency `get_current_user(request: Request, authorization: str | None = Header(default=None))` resolves and validates the token, checks `is_active` and expiry, refreshes `last_seen_at`, and attaches a principal object for downstream RBAC and audit use. `HTTPException(401, "Not authenticated")` on failure; `WWW-Authenticate: Bearer` header added.
6. Rate limiting: simple in-process per-IP/per-username counter with lockout window on login (no new dependency); document that a multi-worker deployment requires a shared store later.

### 9.3 B. Role-based access control
1. Define `require_permission(code: str)` as a FastAPI dependency returning the principal. It resolves permissions from `user_roles` → `role_permissions` → `permissions`, denies by default (401 unauthenticated, 403 `Insufficient permission`).
2. Proposed permission matrix (`✓` = allowed; `R/W/D` = read/write/delete):

   | Resource | administrator | operator | laboratory | ehs_reviewer |
   |---|---|---|---|---|
   | generation | R/W/D | R/W/D | R | R |
   | characterisation (lab) | R/W/D | R | R/W/D | R |
   | handling | R/W/D | R/W/D | R | R |
   | disposals | R/W/D | R/W/D | R | R |
   | compliance | R/W/D | R | R | R/W (no delete) |
   | technology settings | R/W | R | R | R |
   | reports data | R | R | R | R |
   | audit log | R | — | — | R |
   | user/role management | R/W | — | — | — |

   Rationale: only administrators can change the decision matrix; only EHS reviewers can change compliance status; laboratory personnel own lab results; operators own generation/handling/disposal entries; all roles can read what they need for the dashboard.
3. Attach the dependency to every existing route function **without changing its body or return statement**: generation/characterisation/handling/disposal GET→`:read`, POST→`:write`, DELETE→`:delete`; compliance GET→`compliance:read`, POST/PATCH→`compliance:write`, DELETE→`compliance:delete` (admin only); technology GET→`technology:read`, PUT→`technology:write`; `/api/reports/data`→`reports:read`. `/api/health` stays public but stops leaking the DB path.
4. New audit endpoint `GET /api/audit` (and optional filters by actor, resource, record id, time range, action) restricted to `audit:read`; response uses a fixed schema with paginated results. No audit UPDATE/DELETE endpoint is exposed.
5. **Rollout control:** a configuration flag (e.g. `SLUDGE_SMART_AUTH_MODE=shadow|enforce`). In `shadow` mode, unauthenticated/under-privileged requests are still served but generate `PERMISSION_DENIED` audit rows with outcome `failure`. Start in `shadow`, verify logs, then switch to `enforce`. This avoids the silent-local-fallback problem in §6 while the frontend cannot be changed.

### 9.4 C. Audit logging
1. Central helper `record_audit(conn, actor, action, resource, record_id=None, before=None, after=None, outcome="success", detail="", request=None)` writing to `audit_logs` using the same connection as the business operation wherever practical, so a failed business transaction does not leave a misleading success entry and a successful one cannot lose its log.
2. Actor identification comes exclusively from `get_current_user`, never from request bodies. `actor_username` is snapshotted so renames do not rewrite history. `ip_address` uses `request.client.host` and `user_agent` the header; both treated as untrusted metadata.
3. Event rules:
   - POST: `before=None`, `after=full inserted row`, `changed_fields=None`.
   - PATCH/PUT: fetch the row before the update, compute a key-level diff, store `before`, `after`, and `changed_fields` (list of keys). For compliance PATCH, capture the old and new `status`, `due_date`, `detail`, `note`.
   - DELETE: fetch and store the full row as `before`, `after=None`.
   - Authentication: `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGE`, `PERMISSION_DENIED` with `resource="auth"` and no credential values in `detail`.
4. Redaction: strip password, token and `password_hash` fields from any JSON snapshot; never audit raw tokens.
5. Timestamps: `datetime.now(timezone.utc).isoformat(timespec="milliseconds")` for all new rows. Existing timestamp behaviour is left unchanged to preserve response formats.
6. Retention/immutability: append-only at the API layer; restrict reads to administrator and EHS reviewer; define a retention/archival policy later (out of Phase 1). Consider SQLite triggers to block UPDATE/DELETE on `audit_logs` from any future code path.
7. Failure handling: if an audit write fails, fail the enclosing write transaction and return a 500 with a generic detail; never silently skip an audit record.

### 9.5 D. Database and migration strategy
1. One SQL migration file per logical change; `schema_migrations` guarantees idempotence and ordering. `001_phase1.sql` contains only `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `INSERT OR IGNORE` seed statements.
2. Existing six tables and all existing rows are untouched. No `created_by`/`updated_by` columns are added in Phase 1 (would break `SELECT *` response formats); attribution is derived from `audit_logs`.
3. Add `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` in `connect()` (non-destructive; improves concurrent reads/writes once auth adds more DB work). Keep `foreign_keys=ON`.
4. Add an identifier allowlist to `db.insert/update/delete/fetch_all` (valid table names and `str.isidentifier()` column keys) so the f-string pattern cannot become an injection vector.
5. Connection cleanup: use `contextlib.closing` around `connect()` or add an explicit `close()` in a `try/finally` in each helper; combine write + audit into one transaction.
6. Verification before enabling `enforce` mode: run the migration twice against a **copy** of a representative database, assert row counts for all six original tables are unchanged, assert new tables exist, assert indexes exist, and run the endpoint/schema/auth/RBAC/audit test suite.
7. Rollback policy: forward-fix migrations only; if a deployment must be reverted, restore the pre-migration backup file rather than executing destructive down-migrations. Document that the frontend's locally cached records are not part of this backup.

### 9.6 Suggested delivery order
1. Migration runner + `001_phase1.sql` + tests against a copied DB.
2. Password hashing and auth endpoints/dependencies + tests.
3. Roles/permissions seed and `require_permission` + tests.
4. Audit helper, auth events and CRUD event capture + `GET /api/audit` + tests.
5. CORS allowlist, health-path removal, validation hardening, connection cleanup.
6. Shadow-mode soak, then `enforce` flag flip; separately schedule any frontend integration (token header, 401/403 handling, login screen) with explicit approval.

---

**End of report.** This audit was inspection-only: no existing application file, dependency set, database file or record was modified.
