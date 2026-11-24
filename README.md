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

The frontend works without the backend: if the API is unreachable it switches to a clearly marked **local demo mode**, uses the bundled sample data and stores new entries in browser `localStorage`. When the API is running, records persist in SQLite at `data/sludge_smart.db`.

## Structure

```
sludge-smart/
├── backend/
│   └── app/
│       ├── main.py        FastAPI app, CORS, lifespan
│       ├── db.py          SQLite schema, connection and seed logic
│       ├── routers.py     REST endpoints
│       └── schemas.py     Pydantic validation
├── shared/sample-data.json   Illustrative sample records (shared by API + UI)
├── src/
│   ├── components/        Layout, UI primitives, chart wrappers
│   ├── data/              Technology catalogue and criteria
│   ├── hooks/             Data hooks (API with local fallback)
│   ├── lib/               API client and engineering calculations
│   ├── pages/             Seven application modules
│   ├── App.jsx            Hash-based routing
│   └── styles.css         Swiss Design system
├── data/                  SQLite database (created on first backend start)
├── start.py               Convenience launcher
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
