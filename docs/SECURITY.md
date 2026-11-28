# Security

## Current posture

SLUDGE SMART runs in compatibility mode by default: `AUTH_ENFORCEMENT=false`. Legacy business endpoints remain reachable anonymously, but permission denials are logged. Auth, user-management and audit endpoints always require valid credentials. Do not enable enforcement until browser-level role verification is complete.

Backend permissions are authoritative. The React UI mirrors roles for navigation, action visibility and route guards; client-side checks are not a security boundary. Anonymous legacy demo access is preserved, while role-less authenticated users fail closed.

## Passwords and sessions

- Passwords are stored as `pbkdf2_sha256$<iterations>$<salt>$<digest>` with a fresh random salt per password.
- Verification uses `hmac.compare_digest`.
- Existing hashes keep their stored iteration count, so work-factor increases do not invalidate users.
- Login returns a random Bearer token; only its SHA-256 hash is stored.
- Logout and password change revoke sessions. Password change keeps the current session valid and revokes the others.
- Administrator password reset generates a one-time temporary password, revokes all sessions and marks the account for an optional password change.
- Password-change payloads reject extra fields, preventing user_id override attempts.
- Username and password validation enforce 3–64 and 12–256 characters respectively for created users.

## Access control

Roles are `administrator`, `operator`, `laboratory`, `ehs_reviewer`. Permissions are loaded per request from the database, so role changes take effect on the next request. Administrators are treated as superusers.

`must_change_password=1` is informational only. Successful login goes directly to the Dashboard, protected business APIs remain governed solely by RBAC, and password change remains available from account settings.

## Rate limiting

Failed logins are tracked per process by IP and username, and in the database per user. The fifth failure sets a temporary lockout. The in-process counters are pruned to avoid unbounded growth. Multiple uvicorn workers need a shared store; this is a documented limitation.

## Audit

- Audit rows are append-only and protected by SQLite triggers.
- Business writes and audit writes share one transaction.
- Keys containing `password`, `token`, `secret`, `credential` or `hash` are redacted.
- Raw tokens, temporary passwords and password hashes are never written to audit rows.
- `GET /api/audit` requires `audit:read` and validates all filter values.
- Request IDs are accepted only when they match a strict pattern and are echoed in responses.

## API and database hardening

- CORS uses an explicit allowlist and `allow_credentials=False`.
- All values use bound SQLite parameters.
- Table and column identifiers pass allowlist validation before interpolation.
- Request schemas constrain dates (`YYYY-MM-DD` only), numeric ranges, lengths, roles and status values.
- Business numeric inputs and technology weights/scores reject NaN and infinity.
- Health endpoint no longer discloses the database path.
- Invalid JSON responses from the backend are treated as errors by the frontend rather than silently converted to demo data.

## Secrets and deployment

- No real password, hash, token or API key is stored in the repository.
- `.env.example` contains names and safe empty values only.
- Bootstrap credentials must be supplied through the process environment or a secret manager.
- Do not commit `.env` files or database backups.
- Use HTTPS and a reverse proxy in any shared deployment.
- Keep `AUTH_ENFORCEMENT=false` until all clients send tokens and role coverage has been verified. Do not change the existing local environment without explicit approval.

## Controlled enforcement verification

`backend/tests/test_final_qa.py` temporarily sets `AUTH_ENFORCEMENT=true` against isolated temp databases to verify enforcement-mode RBAC, anonymous 401s across all 23 legacy data endpoints, invalid/expired/revoked sessions, password-change gating and lockout recovery. These tests never touch `data/sludge_smart.db`.

Named test-role accounts were created under explicit approval and are recorded in `docs/FINAL_QA_REPORT.md`. Their credentials were never stored in the repository. Verify the role matrix manually in a browser before enabling enforcement.

## Outstanding limitations

- SQLite and the in-process lockout map are single-instance mechanisms.
- Audit retention/archival is not implemented.
- Request metadata is client-controlled and informational only.
- No email/SMS delivery or self-service password reset exists.
- Offline local demo data lives in browser localStorage and is not a secure store for regulated records.
