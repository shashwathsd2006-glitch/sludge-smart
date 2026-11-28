# SLUDGE SMART — Industrial Wastewater Sludge Management System

A functional React + FastAPI application for ETP sludge monitoring, analysis and management, built in a strict Swiss Design visual language (white / black / signal red, modular grid, oversized flush-left type, hairline rules, no rounded cards, shadows or gradients).

## Run

**One command (Windows):**

```bash
python start.py
```

This opens two console windows (FastAPI on port 8000, Vite on port 5300) and launches the browser at <http://localhost:5300>.

**Manual:**

```bash
# Terminal 1 — backend
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — frontend
npm install
npm run dev
```

Open <http://localhost:5300>. API docs are at <http://localhost:8000/docs>.

### Authentication and RBAC

The React frontend now integrates with the Phase 1 authentication API: login,
logout, session restore, token injection, optional password change, role-aware
navigation/actions and clear API error banners. Existing browser workflows still
work in compatibility mode by default (`AUTH_ENFORCEMENT=false`), where
permission denials are logged but not blocked. Set `AUTH_ENFORCEMENT=true` only
after end-to-end role verification is complete.

Create an administrator by setting environment variables before the first
backend start (no default password is shipped):

```bash
export SLUDGE_SMART_ADMIN_USERNAME=admin
export SLUDGE_SMART_ADMIN_PASSWORD='choose-a-long-random-password'
export AUTH_ENFORCEMENT=false
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Key environment variables (see `docs/AUTHENTICATION.md` for the full list):

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_ENFORCEMENT` | `false` | Shadow mode logs denials; `true` blocks unauthorised requests. |
| `SLUDGE_SMART_ADMIN_USERNAME` / `SLUDGE_SMART_ADMIN_PASSWORD` | empty | One-time administrator bootstrap. |
| `SESSION_TTL_SECONDS` | `28800` | Session lifetime. |
| `TRUSTED_ORIGINS` | `http://localhost:5300,http://127.0.0.1:5300` | CORS allowlist. |
| `SLUDGE_SMART_DB_PATH` | `data/sludge_smart.db` | Database override. |

Auth/user/audit endpoints: `POST /api/auth/login`, `POST /api/auth/logout`,
`GET /api/auth/me`, `POST /api/auth/change-password`,
`POST /api/auth/users`, `GET /api/auth/users`,
`PATCH /api/auth/users/{id}`, `POST /api/auth/users/{id}/reset-password`,
`GET /api/audit`. Business endpoints additionally support PATCH for
generation, characterisation, handling and disposals. `GET /api/reports/data`
returns a consistent snapshot for Reports.

Documentation: `docs/ARCHITECTURE.md`, `docs/API_DOCUMENTATION.md`,
`docs/DATABASE_SCHEMA.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`,
`docs/SECURITY.md`, `docs/USER_GUIDE.md`, `docs/AUTHENTICATION.md`,
`docs/RBAC.md`, `docs/AUDIT_LOGGING.md`, `docs/DATABASE_MIGRATIONS.md`,
`docs/FINAL_QA_REPORT.md` and `docs/IMPLEMENTATION_CHECKLIST.md`.

Backend tests (install `backend/requirements-dev.txt` first):

```bash
PYTHONPATH=backend python3 -m pytest backend/tests -q
```

Frontend production build:

```bash
npm run build
```

The frontend works without the backend: if the API is unreachable it switches to a clearly marked **local demo mode**, uses the bundled sample data and stores new entries in browser `localStorage`. When the API is running, records persist in SQLite at `data/sludge_smart.db`.

Latest verification: backend suite `49 passed`; frontend production build succeeded without large-chunk warnings; browser-level UI/PDF/CSV/offline behavior still requires manual verification because no browser engine is available in this workspace. Access enforcement remains in shadow mode (`AUTH_ENFORCEMENT=false`) until explicitly approved.

## Structure

```
sludge-smart/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI app, CORS, middleware, lifespan
│   │   ├── auth.py            Auth, sessions, permissions, audit context
│   │   ├── audit.py           Append-only audit helpers
│   │   ├── config.py          Environment-backed settings
│   │   ├── db.py              SQLite schema, connection and seed logic
│   │   ├── migrations.py      Version-tracked additive migrations
│   │   ├── routers.py         Business REST endpoints
│   │   ├── routers_auth.py    Auth/user/audit endpoints
│   │   └── schemas.py         Pydantic validation
│   ├── migrations/            Additive SQL migrations
│   └── tests/                 Backend regression suite
├── docs/                      Architecture, API, deployment and user guides
├── shared/sample-data.json    Illustrative sample records (shared by API + UI)
├── src/
│   ├── components/            Layout, auth shell, UI primitives
│   ├── context/               AuthContext session state
│   ├── data/                  Technology catalogue and criteria
│   ├── hooks/                 Data hooks (API with local fallback)
│   ├── lib/                   API client, permissions and calculations
│   ├── pages/                 Seven application modules plus auth screens
│   ├── App.jsx                Hash-based routing
│   └── styles.css             Swiss Design system
├── data/                      SQLite database (created on first backend start)
├── .env.example               Non-secret configuration template
├── start.py                   Convenience launcher
└── package.json
```

## Modules

| # | Module | What it does |
|---|--------|--------------|
| 01 | Dashboard | Six key figures, generation and moisture trends, recent lab and disposal records, compliance snapshot |
| 02 | Sludge Generation | Validated daily-entry form; dry solids = wet × (100 − moisture)/100; rate = dry solids / m³; monthly and annual projections; history tables and charts |
| 03 | Characterisation | Full lab form (pH, solids, O&G, COD, Pb, Cr, Cd, Ni, other), searchable register, parameter trends, unusual-result screening, missing-parameter report |
| 04 | Sludge Handling | Thickening, dewatering and drying calculators; dry solids retained, final mass, mass reduction; performance comparison chart |
| 05 | Technology Selection | Nine weighted criteria, editable 1–5 scores, weighted decision matrix, ranking, recommendation and indicative cost/resource table |
| 06 | Compliance | User-maintained checklist with Compliant / Action required / Information missing states, due dates and notes, plus disposal consignment register |
| 07 | Reports | Selectable sections, on-screen preview, PDF download (jsPDF) and flat CSV export |

## Calculations

- **Dry solids (kg/day)** = wet sludge × (100 − moisture %) / 100
- **Generation rate (kgDS/m³)** = dry solids / wastewater treated
- **Monthly / annual production** = daily wet sludge × operating days × (1 / 12)
- **Dry solids retained (kg)** = initial mass × (100 − initial moisture) / 100
- **Final mass (kg)** = dry solids retained / ((100 − final moisture) / 100)
- **Mass reduction (%)** = (initial mass − final mass) / initial mass × 100
- **Weighted score** = Σ(weight × score) / Σ(weights), with scores 1–5 where 5 is most favourable

Mass-balance calculations assume complete dry-solids retention; solids losses in filtrate or decanter liquor are not modelled.

## Data and compliance disclaimer

All preloaded records in `shared/sample-data.json` are labelled **SAMPLE** in tables and charts. They are illustrative only and are **not actual laboratory results, regulatory limits or compliance evidence**. Screening bands in Characterisation are illustrative internal data-quality aids, not limit values. Compliance statuses are user-maintained readiness indicators; the application never certifies legal compliance. Verify all figures against site measurements, recognised laboratory reports and current CPCB/KSPCB conditions before regulatory use.
