# Authentication

Authentication preserves all original legacy endpoint paths, request models and success response formats. Later completion work added PATCH endpoints and optional list filters without changing existing response shapes.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_ENFORCEMENT` | `false` | Shadow mode (`false`) logs permission denials but serves legacy endpoints; `true` enforces them. |
| `SLUDGE_SMART_ADMIN_USERNAME` | empty | Bootstrap administrator username. No account is created when empty. |
| `SLUDGE_SMART_ADMIN_PASSWORD` | empty | Bootstrap password; hashed on first startup and never stored in plaintext. |
| `SLUDGE_SMART_ADMIN_PASSWORD_HASH` | empty | Alternative pre-hashed bootstrap password (`pbkdf2_sha256$...`); takes precedence. |
| `SLUDGE_SMART_ADMIN_FULL_NAME` | `Administrator` | Bootstrap display name. |
| `SLUDGE_SMART_ADMIN_EMAIL` | empty | Bootstrap email. |
| `SESSION_TTL_SECONDS` | `28800` (8 h) | Session lifetime; minimum 60. |
| `PBKDF2_ITERATIONS` | `310000` | PBKDF2-HMAC-SHA256 work factor; minimum 100000. |
| `MAX_FAILED_ATTEMPTS` | `5` | Failed logins before temporary lockout. |
| `LOCKOUT_SECONDS` | `900` | Lockout window. |
| `TRUSTED_ORIGINS` | `http://localhost:5300,http://127.0.0.1:5300` | Comma-separated CORS allowlist. No wildcard. |
| `SLUDGE_SMART_DB_PATH` | `<project>/data/sludge_smart.db` | Database location override, used by tests. |

Do not commit real passwords or hashes. Supply them through the process environment or a secret manager.

## Password storage

`hash_password()` generates a fresh 16-byte random salt and stores:

```
pbkdf2_sha256$<iterations>$<base64(salt)>$<base64(digest)>
```

Verification uses `hmac.compare_digest`. Existing hashes are verified with the stored iteration count, so raising `PBKDF2_ITERATIONS` later does not invalidate current users. New passwords require 3–64 character usernames (`A-Za-z0-9_.-`) and 12–256 character passwords.

## Sessions

- `POST /api/auth/login` returns `{"access_token", "token_type": "bearer", "expires_at"}`.
- Tokens are 32-byte URL-safe random values (`secrets.token_urlsafe(32)`). Only their SHA-256 hashes are stored in `user_sessions.token_hash`; the raw token is never written to the database, logs or audit rows.
- Send the token as `Authorization: Bearer <token>`. Cookies are not used and CORS keeps `allow_credentials=False`.
- `POST /api/auth/logout` revokes the current session (`revoked_at`); subsequent requests with that token return 401.
- Expired, revoked and inactive-user sessions are rejected. `GET /api/auth/me` returns identity and roles without password or token data.
- In-process per-IP/username failed-login counters and a database `locked_until` field provide basic brute-force resistance. A multi-worker deployment should replace the in-process counter with a shared store.

## Password management

- `POST /api/auth/change-password` requires a valid token and `{"current_password", "new_password"}`. The current password must match; the new password must be 12–256 characters and must differ from the current one. Extra fields are rejected.
- On success the response is `{"changed": true, "sessions_revoked": <count>}`: `must_change_password` is cleared, `password_changed_at` and `updated_at` are set, login lockout counters are cleared, and every **other** active session for that user is revoked. The current session stays valid so the user is not locked out mid-change.
- `POST /api/auth/users/{user_id}/reset-password` requires `users:write` (administrator). It hashes a freshly generated 43-character URL-safe temporary password, sets `must_change_password=1`, updates `password_changed_at`, clears lockout counters, and revokes **all** sessions for the target user. The plaintext temporary password is returned once in `{"reset": true, "temporary_password": ..., "sessions_revoked": <count>}` and is never stored in the database or audit log. The target can change it at any time from account settings.
- `must_change_password` is an informational account flag, not a permission denial or a redirect condition. Successful login goes directly to the Dashboard for all roles.
- Password change remains available to any authenticated user from account settings and through `POST /api/auth/change-password`. RBAC and `AUTH_ENFORCEMENT` behaviour are unchanged by this flag.
- `X-Password-Change-Required` is no longer emitted by the API.
- Successful and failed `PASSWORD_CHANGE` attempts and `PASSWORD_RESET` operations are recorded via `audit.record_audit()`. No plaintext password, temporary password or password hash is ever included in an audit row; keys containing `password`, `token`, `secret`, `credential` or `hash` are redacted.

## User administration

- `POST /api/auth/users` (administrator only) creates a user with one or more roles and `must_change_password=1`; the password is hashed before storage and the response never includes it.
- `GET /api/auth/users` lists users.
- `PATCH /api/auth/users/{id}` updates profile, active state, password-change requirement and roles.
- `POST /api/auth/users/{id}/reset-password` (administrator only) issues a one-time temporary password and revokes the target's sessions.
- All four endpoints require a valid token regardless of `AUTH_ENFORCEMENT`; there is no anonymous user registration.

## Compatibility mode

With `AUTH_ENFORCEMENT=false`, legacy endpoints keep working without a token. If a valid token is supplied, the audit log attributes the change to that user; otherwise it is explicitly recorded as `anonymous`. Denials are recorded as `PERMISSION_DENIED` with outcome `failure` but the request is still served. Set `AUTH_ENFORCEMENT=true` to return 401/403 instead. `must_change_password` does not affect this flag or API availability. The frontend authenticates, restores sessions, injects tokens and mirrors roles for navigation/actions, but backend permissions remain authoritative.

## Example

```bash
export SLUDGE_SMART_ADMIN_USERNAME=admin
export SLUDGE_SMART_ADMIN_PASSWORD='a-long-random-password'
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"a-long-random-password"}' | python -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')

curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/auth/me
```

## Known limitations

- There is no email/SMS delivery or public self-service reset; administrators issue a one-time temporary password through the authenticated reset endpoint and hand it over out of band.
- Rate-limit counters are per process, not shared between uvicorn workers. Failed `change-password` attempts do not increment the login lockout counters.
- Sessions do not rotate automatically; clients should log out before discarding a token.
