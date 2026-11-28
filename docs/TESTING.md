# Testing

## Automated backend suite

Install test dependencies and run from the project root:

```bash
python -m pip install -r backend/requirements.txt
python -m pip install -r backend/requirements-dev.txt
PYTHONPATH=backend python3 -m pytest backend/tests -q
```

Latest verified result: `78 passed in 11.50s`.

## Backend test files

| File | Covers |
|---|---|
| `test_api_compatibility.py` | Legacy endpoint paths, request models and exact success response keys. |
| `test_auth.py` | Password hashing, sessions, login, logout, identity, password change, direct login access for flagged roles and invalid-login rejection. |
| `test_rbac.py` | Seeded permission matrix, shadow mode, enforcement mode and strict auth endpoints. |
| `test_audit.py` | Append-only behaviour, redaction and request correlation. |
| `test_migrations.py` | Additive migrations, row-count preservation, idempotence and indexes. |
| `test_completion_fixes.py` | Direct business API access for flagged users, frontend direct-Dashboard/optional password-change assertions, audit timestamp filters, shadow-denial resource filters, PATCH endpoints, list filters, UTC timestamps, validation hardening and lockout pruning. |
| `test_final_qa.py` | Full enforcement-mode matrices, invalid/expired/revoked sessions, persistence across app restarts, reports snapshot, audit rows, password change, lockout recovery, user management and anonymous 401s across all 23 legacy data endpoints. |
| `test_generation_calculations.py` | Generation input round-trip, formula values, PATCH persistence, latest-record ordering and invalid-input rejection. |
| `test_handling_ordering.py` | Handling process-stage ordering, newest date first, stable id tie-break, reports snapshot and PATCH reordering. |
| `test_technology_selection.py` | Technology default matrix integrity, weight/score persistence, invalid weight/score rejection and stored JSON verification. |

Tests use temporary databases and never write to `data/sludge_smart.db`. Live-database checks are separate, read-only and recorded in `docs/FINAL_QA_REPORT.md`.

## Frontend build check

```bash
npm install
npm run build
```

Latest verified result: successful build in `1.69s` with no chunk-size warning. Route-level chunks are generated for each page, plus separate auth, calculation and reporting chunks.

Generation tests run with `npm run test:generation`, handling ordering with `npm run test:handling`, and technology selection with `npm run test:technology`. There is no general frontend unit-test suite or configured frontend lint/typecheck script. Browser automation is not available in this workspace.

## Pure calculation checks

These checks need only Node and the shipped source/sample data:

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict'; import { generationMetrics, handlingMetrics, matrixResults, normalizeWeights, screeningFlags, missingParameters } from './src/lib/calc.js'; const sample = JSON.parse(readFileSync('./shared/sample-data.json', 'utf8')); const g = generationMetrics({ wet_sludge_kg: 1120, moisture_pct: 94.2, wastewater_m3: 420, operating_days: 26 }); assert.ok(Math.abs(g.dry - 64.96) < 0.01); assert.ok(Math.abs(g.rate - 0.1547) < 0.001); const h = handlingMetrics({ initial_mass_kg: 1000, initial_moisture_pct: 91, final_moisture_pct: 70 }); assert.ok(Math.abs(h.finalMass - 300) < 0.001); assert.ok(Math.abs(h.reduction - 70) < 0.001); const ranking = matrixResults(sample.technology); assert.equal(ranking[0].id, 'solar-drying'); assert.equal(ranking.length, 10); assert.equal(Object.values(normalizeWeights(sample.technology.weights)).reduce((a, b) => a + b, 0), 100); const missingLab = sample.lab.find((row) => row.cadmium_mgkg === null); assert.ok(missingParameters(missingLab).includes('cadmium_mgkg')); const flaggedLab = sample.lab.find((row) => screeningFlags(row).length > 0); assert.ok(flaggedLab); console.log('calculation checks passed');"
```

Latest verified result: `calculation checks passed`. `npm run test:generation` adds 6 Node tests for live-form state updates, validation, formulas and latest saved-record selection; `npm run test:handling` adds 4 ordering tests; `npm run test:technology` adds 9 tests for criteria/technology integrity, normalization, scoring, ties, bounds, generation projection, reference mapping and UI disclaimer/units.

## Manual verification checklist

Use a clean browser session and a non-production database or known demo data. Browser-level results are not claimed as verified in this workspace.

1. Start backend and frontend; confirm `/api/health` responds.
2. Log in as an administrator; confirm redirect to password change when required.
3. Change the password; confirm the current session remains usable and other sessions are revoked.
4. Reload the app; confirm session restoration from `sessionStorage`.
5. Confirm role-specific navigation/actions for administrator, operator, laboratory and EHS reviewer.
6. In each data module, add a record, edit it, delete it with confirmation and confirm audit rows are written.
7. Apply date and source filters to generation, characterisation, handling and disposals.
8. Confirm invalid dates, unknown source and invalid technology scores show visible errors.
9. Confirm compliance checklist status changes, full edits and disposal consignment register updates.
10. Save technology weights/scores and confirm provenance text remains clear.
11. Generate Reports; confirm sections 01–09, disposal data, PDF export and CSV export.
12. Stop the backend and reload the app; confirm local demo mode appears with a clear banner.
13. Restore the backend; confirm API mode resumes and the last error clears.
14. Confirm `CSV export (current view)` respects current filters and `PDF export` downloads the generated PDF.

## Known gaps

- No browser automation means rendered UI behaviour is not automatically asserted in CI; generation state logic is covered by Node tests.
- No frontend lint/typecheck script is configured.
- Audit retention, shared lockouts and distributed transactions are not covered because they are not implemented.
- PDF/CSV output should be visually checked against current A4 printing behaviour.
- PostgreSQL migration strategy is documented but not executed.
