# Architecture

## Overview

SLUDGE SMART is a local-first industrial wastewater sludge management application. It keeps the original React/Vite interface and FastAPI/SQLite backend, and adds authentication, RBAC, audit logging, edit workflows, report aggregation and explicit error states without changing the visual language or the existing success response shapes.

The application is intentionally conservative:

- `AUTH_ENFORCEMENT=false` by default, so legacy business endpoints remain usable in shadow mode.
- SQLite remains the persistence layer; no external database is required.
- Sample data remains clearly marked as illustrative.
- Backend permissions remain authoritative even though the UI mirrors roles for navigation and action visibility.

## Runtime components

### Frontend

- React 18 with Vite on port `5300`.
- Hash-based routing across seven modules plus login and optional password-change screens.
- `AuthContext` restores sessions from `sessionStorage`, injects Bearer tokens and exposes login/logout/password change. Offline demo records use a separate `localStorage` namespace.
- `api.js` centralises REST calls, token headers, response validation and last-error state. Invalid JSON or non-2xx responses become visible UI errors instead of silent fallback.
- `useData` provides collection CRUD and retries with local demo fallback only on network failure; server errors are surfaced.
- `UI.jsx` supplies shared primitives including `DataState` and `DateRangeFilter`.
- `styles.css` implements the white/black/signal-red Swiss Design system: modular grid, hairline rules, oversized flush-left typography and no rounded cards, shadows or gradients.

### Backend

- FastAPI app in `backend/app/main.py` with CORS, request-ID middleware and a lifespan that initialises the database, applies migrations and ensures the configured bootstrap administrator.
- `config.py` reads all settings from environment variables with compatibility defaults.
- `db.py` owns SQLite schema, connection lifecycle, transactions, validation of table/column identifiers and sample-data seeding.
- `migrations.py` applies version-tracked additive SQL files.
- `auth.py` implements password hashing, sessions, principals, permission checks and lockouts.
- `audit.py` writes append-only audit rows in the same transaction as the business change.
- `routers.py` exposes legacy business endpoints and `GET /api/reports/data`.
- `routers_auth.py` exposes authentication, user administration and audit inspection endpoints.
- `schemas.py` defines and validates all request payloads.

## Request flow

1. Browser sends a request with `Authorization: Bearer <token>` when a session exists.
2. Request-ID middleware accepts a valid `X-Request-ID` or generates one.
3. FastAPI dependency resolves the principal and checks the permission code.
   - With `AUTH_ENFORCEMENT=true`, missing or invalid credentials return 401 and insufficient permissions return 403.
   - With `AUTH_ENFORCEMENT=false`, denials are audited but the request continues.
4. Router validates the payload through Pydantic.
5. Router opens a `db.transaction()`, performs the business write, writes the audit row in the same transaction, commits and returns the existing response shape.
6. Frontend updates React state from the response and clears last-error state.

## Persistence

- Default database: `data/sludge_smart.db`.
- WAL journal mode and foreign keys are enabled.
- Connections are explicitly closed after each operation.
- Table and column names pass allowlist validation before interpolation; all values use bound parameters.
- Audit rows are protected from UPDATE and DELETE by SQLite triggers.
- Migrations are additive only; no destructive down-migrations are shipped.

## Authentication and RBAC

- Passwords use PBKDF2-HMAC-SHA256 with a per-user random salt.
- Sessions use random tokens; only SHA-256 hashes are stored.
- Roles: `administrator`, `operator`, `laboratory`, `ehs_reviewer`.
- Administrators are treated as superusers.
- `must_change_password=1` is informational only; successful login goes directly to the Dashboard and password change remains available from account settings.
- The frontend fails open only for anonymous/offline demo use; authenticated role checks are mirrored for UX but never trusted as enforcement.

## Reports

`GET /api/reports/data` returns a consistent snapshot of generation, characterisation, handling, disposals, compliance and technology settings with a UTC `generated_at`. The Reports page uses this endpoint first and falls back to individual list endpoints only when the API is unreachable or the endpoint is unavailable.

## Current verification state

- Backend suite: `PYTHONPATH=backend python3 -m pytest backend/tests -q` — 36 tests passed.
- Frontend build: `npm run build` — passed; Vite reports only the pre-existing large-chunk warning.
- Browser automation is not available in the workspace; auth, role gating, PDF, CSV and edit flows require manual browser verification.
