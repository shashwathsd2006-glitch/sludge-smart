# API documentation

## Base conventions

- Base URL during local development: `http://localhost:8000`.
- All application endpoints are under `/api`.
- Request and response bodies are JSON.
- Authenticated requests use `Authorization: Bearer <access_token>`.
- Interactive OpenAPI docs remain available at `/docs`, `/redoc` and `/openapi.json`.
- Legacy business endpoints preserve their original success response shapes.

With `AUTH_ENFORCEMENT=false`, legacy endpoints remain available without a token; denials are recorded but not blocked. Auth/user/audit endpoints always require valid credentials. With `AUTH_ENFORCEMENT=true`, legacy endpoints block missing or insufficient permissions with 401/403.

## Health

| Method | Path | Permission | Response |
|---|---|---|---|
| GET | `/api/health` | public | `200 {"status":"ok","database":"configured"}` |

## Authentication and users

| Method | Path | Required permission | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Exchange username/password for a Bearer token. Returns `access_token`, `token_type` and `expires_at`. |
| POST | `/api/auth/logout` | authenticated | Revoke the current session. |
| GET | `/api/auth/me` | authenticated | Return identity, roles and account flags; never returns token or password data. |
| POST | `/api/auth/change-password` | authenticated | Change the current user's password; requires `current_password` and a new password of 12–256 characters. |
| POST | `/api/auth/users` | `users:write` | Create a user with at least one role. |
| GET | `/api/auth/users` | `users:read` | List users as `{"items":[...],"total":n}`. |
| PATCH | `/api/auth/users/{user_id}` | `users:write` | Update profile, active state, password-change flag or roles. |
| POST | `/api/auth/users/{user_id}/reset-password` | `users:write` | Issue a one-time temporary password and revoke sessions. |

`UserOut` contains `id`, `username`, `full_name`, `email`, `is_active`, `must_change_password`, `roles`, `created_at` and `last_login_at`. Passwords, hashes and token values are never returned.

## Business endpoints

| Method | Path | Required permission | Success |
|---|---|---|---|
| GET | `/api/generation` | `generation:read` | `200` list of generation records |
| POST | `/api/generation` | `generation:write` | `201` created record |
| PATCH | `/api/generation/{id}` | `generation:write` | `200` updated record |
| DELETE | `/api/generation/{id}` | `generation:delete` | `200 {"deleted":id}` |
| GET | `/api/characterisation` | `lab:read` | `200` list of lab records |
| POST | `/api/characterisation` | `lab:write` | `201` created record |
| PATCH | `/api/characterisation/{id}` | `lab:write` | `200` updated record |
| DELETE | `/api/characterisation/{id}` | `lab:delete` | `200 {"deleted":id}` |
| GET | `/api/handling` | `handling:read` | `200` list of handling runs |
| POST | `/api/handling` | `handling:write` | `201` created record |
| PATCH | `/api/handling/{id}` | `handling:write` | `200` updated record |
| DELETE | `/api/handling/{id}` | `handling:delete` | `200 {"deleted":id}` |
| GET | `/api/disposals` | `disposal:read` | `200` list of disposal records |
| POST | `/api/disposals` | `disposal:write` | `201` created record |
| PATCH | `/api/disposals/{id}` | `disposal:write` | `200` updated record |
| DELETE | `/api/disposals/{id}` | `disposal:delete` | `200 {"deleted":id}` |
| GET | `/api/compliance` | `compliance:read` | `200` list of compliance items |
| POST | `/api/compliance` | `compliance:write` | `201` created item |
| PATCH | `/api/compliance/{id}` | `compliance:write` | `200` updated item |
| DELETE | `/api/compliance/{id}` | `compliance:delete` | `200 {"deleted":id}` |
| GET | `/api/technology` | `technology:read` | `200 {"weights":...,"scores":...,"updated_at":...}` |
| PUT | `/api/technology` | `technology:write` | `200` saved settings object |
| GET | `/api/reports/data` | `reports:read` | `200` report snapshot |

PATCH endpoints for generation, characterisation, handling and disposals take the same full payload model as their POST endpoint. Compliance PATCH accepts `status`, `area`, `requirement`, `detail`, `note` and `due_date`; explicitly sending `due_date: null` clears the date, and a payload with no fields returns 400.

## List filters

Generation, characterisation, handling and disposals support optional query parameters:

| Parameter | Type | Notes |
|---|---|---|
| `date_from` | ISO date string | Inclusive lower bound; invalid values return 400. |
| `date_to` | ISO date string | Inclusive upper bound; invalid values return 400. |
| `source` | `sample` or `user` | Unknown values return 400. |
| `limit` | integer 1–5000 | Omitting it preserves the original unlimited response. |
| `offset` | integer ≥ 0 | Used with `limit`. |

Compliance and technology do not use these filters.

## Report snapshot

`GET /api/reports/data` returns:

```json
{
  "generation": [],
  "characterisation": [],
  "handling": [],
  "disposals": [],
  "compliance": [],
  "technology": {"weights": {}, "scores": {}, "updated_at": null},
  "generated_at": "2026-11-27T00:00:00+00:00"
}
```

The snapshot avoids mixing records read at different times.

## Audit inspection

`GET /api/audit` requires `audit:read`.

| Parameter | Notes |
|---|---|
| `action` | Must be a known audit action. |
| `resource` | Must be a known table, `auth` or a permission code. |
| `actor_user_id` | Positive integer user ID. |
| `from_ts` | ISO-8601 timestamp; invalid values return 400. |
| `to_ts` | ISO-8601 timestamp; invalid values return 400. |
| `limit` | 1–500, default 100. |
| `offset` | ≥ 0, default 0. |

`from_ts` later than `to_ts` returns 400. The response is `{"items":[...],"total":n,"limit":n,"offset":n}`.

## Validation

- Dates use `YYYY-MM-DD`.
- Generation values are positive-bounded; moisture is `0 <= value < 100`.
- Lab values are non-negative and pH is 0–14; analytes are nullable.
- Handling requires final moisture no greater than initial moisture.
- Disposal requires quantity, facility and manifest number.
- Compliance status is one of `Compliant`, `Action required`, `Information missing`.
- Technology weights must be finite numbers 0–1000; scores must be finite numbers 1–5.
- Password-change payloads reject extra fields.

## Errors

Validation failures use FastAPI/Pydantic 422 responses. Explicit errors use `{"detail":"..."}`:

- 400 for invalid filters, unknown source/resource/action or empty compliance patch.
- 401 for invalid credentials or missing/invalid tokens on strict/enforced routes.
- 403 for insufficient permissions.
- 404 for missing records.
- 409 for duplicate usernames.
- 423 for login lockouts and rate limiting.
