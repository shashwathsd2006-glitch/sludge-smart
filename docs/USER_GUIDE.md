# User guide

## Access

If authentication is enabled for your environment, log in with the username and password issued by an administrator. If the account requires a password change, enter the current password and a new password of at least 12 characters before continuing.

If the backend is unavailable, the app switches to clearly marked local demo mode. Changes in demo mode stay in that browser's localStorage and are not written to the SQLite database.

## Working with records

Generation, Characterisation, Handling and Disposal records support:

- Adding a new entry from the module form.
- Editing an existing row with the row action.
- Deleting a row after confirmation.
- Filtering by date range and, where shown, source.
- Loading and error states that explain what happened.

Every change is audited with the current user when a valid session exists, otherwise as `anonymous` in shadow mode.

## Module 01 — Dashboard

Shows six key figures, generation and moisture trends, recent lab/disposal records and a compliance snapshot. It reads data from the API; no direct editing is performed here.

## Module 02 — Sludge Generation

Records daily wastewater volume, wet sludge mass, moisture and operating days. Dry solids and generation rates are calculated automatically. Monthly and annual projections use the operating-day factor.

## Module 03 — Characterisation

Records laboratory results including pH, solids, oil and grease, COD and metals. The register is searchable, trends are charted and unusual-result screening uses illustrative internal aids. Missing-parameter reporting highlights incomplete records.

## Module 04 — Sludge Handling

Calculates thickening, dewatering and drying outcomes from initial mass and moisture values. Final moisture cannot exceed initial moisture. Results show retained dry solids, final mass and mass reduction.

## Module 05 — Technology Selection

Edit criterion weights and 1–5 scores for each technology. The weighted score is `Σ(weight × score) / Σ(weights)`; the highest score is recommended and the next highest is shown as runner-up, with ties keeping catalogue order. `NORMALISE TO 100` scales positive weights to whole-number weights totalling exactly 100 (drift is applied to the largest weight); all-zero weights become 12 for Feasibility and 11 for each other criterion. Cost and resource figures are illustrative planning estimates, not quotations or verified plant measurements, and must be checked against current site sources.

## Module 06 — Compliance

Maintains the checklist with `Compliant`, `Action required` and `Information missing` states, due dates and notes. Moving an item to `Compliant` is recorded as an approval. The disposal consignment register supports add, edit and delete with date filters.

## Module 07 — Reports

Select sections and preview them on screen. Reports use one backend snapshot so all sections reflect the same point in time. PDF export is scaled for A4; if a table exceeds the printable page limit, the PDF states that rows were omitted. CSV export downloads a flat table and reports failures visibly.

## Data meaning and disclaimer

Records marked SAMPLE are illustrative only. They are not actual laboratory results, regulatory limits or compliance evidence. Screening bands are internal data-quality aids, not statutory limits. Compliance statuses are user-maintained readiness indicators; the application never certifies legal compliance.

Verify all figures against site measurements, recognised laboratory reports and current CPCB/KSPCB conditions before regulatory use. Mass-balance calculations assume complete dry-solids retention and do not model solids losses in filtrate or decanter liquor.
