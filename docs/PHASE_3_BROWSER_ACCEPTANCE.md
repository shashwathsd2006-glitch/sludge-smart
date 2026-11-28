# Phase 3 Manual Browser Acceptance

Project: `/Users/shashwathsduvani/Downloads/sludge-smart-main`  
Prepared: 2026-11-28  
Status: **PREPARED — NOT BROWSER-EXECUTED IN THIS WORKSPACE**

## Execution constraint

Browser automation is unavailable in this workspace (`chromium`/`google-chrome`/`playwright` not found; Python `playwright` not installed). I cannot interact with a rendered browser or open downloaded PDF/CSV files. This document provides the exact manual checklist to execute. **Do not mark any browser/PDF/CSV test PASS without actual browser verification.**

## 1. Preparation (verified where possible)

| Check | Expected | Actual | PASS/FAIL | Notes |
|---|---|---|---|---|
| Startup commands | `python start.py` or manual backend/frontend commands documented | `start.py` exists; README/startup commands confirmed | PASS (doc/config) | See commands below |
| Backend health | `GET /api/health` returns `{"status":"ok","database":"connected"}` | HTTP 200 with expected body on 2026-11-28 | PASS (API) | `http://127.0.0.1:8000/api/health` |
| Frontend health | `http://localhost:5300/` returns HTTP 200 | HTTP 200 on 2026-11-28 | PASS (HTTP) | Rendered UI not verified |
| DB unchanged | No reset/record mutation | SHA-256 `39c0c2ff45d7b747f18cf57dc4d90d375bdbb8b83322c67ff1317e4ebe84b444` | PASS | Check again after manual run |
| Browser available | Real browser can be used | Not available in workspace | FAIL (workspace) | Manual execution required by user |

### Startup commands

Windows one-command:
```bash
python start.py
```

Manual:
```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
```bash
npm install
npm run dev
```

URLs: Frontend `http://localhost:5300`, API docs `http://localhost:8000/docs`, Health `http://127.0.0.1:8000/api/health`.

**Do not reset DB. Do not change existing passwords/users.**

## 2. Manual acceptance checklist

For each test, fill Actual result, PASS/FAIL, Browser/Date, and Notes during execution.

### Authentication

| Test name | Expected result | Actual result | PASS/FAIL | Browser and date | Notes/defects |
|---|---|---|---|---|---|
| Administrator login (Gowtham) | Valid login lands directly on Dashboard (`/#/`); no password-change redirect |  |  |  | Use approved credential; do not record password |
| Operator login (test_operator) | Direct Dashboard; role/operator navigation visible |  |  |  |  |
| Laboratory login (test_laboratory) | Direct Dashboard; laboratory navigation/permissions visible |  |  |  |  |
| EHS reviewer login (test_ehs_reviewer) | Direct Dashboard; EHS navigation/permissions visible |  |  |  |  |
| Invalid login rejection | Wrong password shows rejection; no session created |  |  |  |  |
| Role-based navigation | Each role sees permitted modules/actions; unauthorized actions hidden/blocked |  |  |  | Admin all; Operator gen/handling/disposal write; Lab char write; EHS compliance write |

### Generation

| Test name | Expected result | Actual result | PASS/FAIL | Browser and date | Notes/defects |
|---|---|---|---|---|---|
| Live calculations | Changing wastewater/wet/moisture/operating days updates preview immediately |  |  |  | DS = wet*(100-moisture)/100; rate=DS/wastewater |
| Input validation | Empty/zero/negative/invalid values rejected with clear errors |  |  |  |  |
| Record saving | Valid record saves and appears in history |  |  |  | Use isolated DB for write tests if possible |
| Historical records | Existing/new records visible with correct fields |  |  |  |  |
| Production summary after refresh | Refresh page; summary reflects latest saved record |  |  |  |  |

### Characterisation

| Test name | Expected result | Actual result | PASS/FAIL | Browser and date | Notes/defects |
|---|---|---|---|---|---|
| Lab form submission | Valid sample saves successfully |  |  |  |  |
| Numeric validation | Invalid numeric/date inputs rejected |  |  |  |  |
| Missing parameter handling | Missing optional values allowed/displayed as missing, not fabricated |  |  |  |  |
| Record history | Saved records appear in history/list |  |  |  |  |
| Persistence after refresh | Refresh retains saved record |  |  |  |  |

### Handling

| Test name | Expected result | Actual result | PASS/FAIL | Browser and date | Notes/defects |
|---|---|---|---|---|---|
| Thickening calculation | Mass-balance output correct for inputs |  |  |  | Final mass=dry/(1-final_moisture/100) |
| Dewatering calculation | Mass-balance output correct |  |  |  |  |
| Drying calculation | Mass-balance output correct |  |  |  |  |
| Save one run per stage | Thickening, Dewatering, Drying runs save |  |  |  |  |
| Ordering | Table ordered Thickening, Dewatering, Drying; newest first within stage |  |  |  |  |
| Persistence after refresh | Runs remain after refresh |  |  |  |  |

### Technology Selection

| Test name | Expected result | Actual result | PASS/FAIL | Browser and date | Notes/defects |
|---|---|---|---|---|---|
| Weight adjustment | Sliders/inputs change weights |  |  |  |  |
| Normalize to 100 | NORMALISE TO 100 makes total exactly 100 |  |  |  |  |
| Technology score editing | Scores editable 1–5; invalid rejected |  |  |  |  |
| Dynamic ranking | Ranking updates when weights/scores change |  |  |  |  |
| Recommendation changes | Top recommendation/runner-up updates appropriately |  |  |  |  |
| Matrix save/retrieve | Save Matrix persists; refresh restores values |  |  |  |  |

### Compliance

| Test name | Expected result | Actual result | PASS/FAIL | Browser and date | Notes/defects |
|---|---|---|---|---|---|
| Record creation | Checklist/disposal record can be created by authorized role |  |  |  |  |
| Record editing | Existing record editable; changes persist |  |  |  |  |
| Status display | Statuses shown correctly; no invented regulatory limits |  |  |  |  |
| Validation | Invalid/missing required fields rejected |  |  |  |  |
| Historical record retrieval | Records visible after refresh/filter |  |  |  |  |
| Role-based access | EHS/admin write as designed; unauthorized roles restricted |  |  |  |  |

### Reports (actual downloaded files required)

| Test name | Expected result | Actual result | PASS/FAIL | Browser and date | Notes/defects |
|---|---|---|---|---|---|
| PDF download | PDF downloads and opens |  |  |  |  |
| CSV download | CSV downloads and opens |  |  |  |  |
| Correct data | Records match selected/report snapshot |  |  |  |  |
| Correct dates | Dates formatted correctly |  |  |  |  |
| Correct units | Units shown correctly (kg, kg/day, m³, %, etc.) |  |  |  |  |
| Correct record counts | Counts match UI/data |  |  |  |  |
| No missing/duplicated records | All expected rows present once |  |  |  |  |
| Correct formatting | Readable layout, A4 PDF, CSV parseable |  |  |  |  |

## 3. Evidence log template

| Date | Browser/version | Tester | DB mode (live/isolated) | Live DB hash before | Live DB hash after | Overall notes |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## 4. Defects found

| ID | Module | Severity | Steps to reproduce | Expected | Actual | Status |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## 5. Signoff rule

Phase 3 can be marked complete only after a human tester executes the checklist in a real browser and inspects downloaded PDF/CSV files. Automated/API results are supporting evidence only.
