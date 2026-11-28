# Role-based access control

RBAC is enforced in FastAPI dependencies and remains authoritative there. The React UI mirrors roles for navigation/action visibility, route guards and user feedback; anonymous legacy demo access is preserved while role-less authenticated users fail closed. `AUTH_ENFORCEMENT` controls whether a denial blocks a legacy request or is only logged.

## Roles

| Role | Intended use |
|---|---|
| `administrator` | Full access, including user management, permission seed data and audit inspection. |
| `operator` | Day-to-day generation, handling and disposal records. |
| `laboratory` | Characterisation records only. |
| `ehs_reviewer` | Compliance review, approvals, audit inspection and reports. |

Roles, permissions and the role→permission links are seeded idempotently by `migrations/001_phase1.sql`. Administrators are implicitly treated as superusers, so a newly added permission code does not lock them out.

## Permission matrix

| Permission | administrator | operator | laboratory | ehs_reviewer |
|---|:---:|:---:|:---:|:---:|
| `generation:read/write/delete` | ✓ | ✓ / ✓ / ✓ | read only | read only |
| `lab:read/write/delete` | ✓ | read only | ✓ | read only |
| `handling:read/write/delete` | ✓ | ✓ | read only | read only |
| `disposal:read/write/delete` | ✓ | ✓ | read only | read only |
| `compliance:read/write/delete` | ✓ | read | read | read / write / — |
| `technology:read/write` | ✓ | read | read | read |
| `reports:read` | ✓ | ✓ | ✓ | ✓ |
| `audit:read` | ✓ | — | — | ✓ |
| `users:read/write` | ✓ | — | — | — |

## How enforcement works

- `auth.require_permission(code)` is attached to every legacy endpoint. It resolves a `Principal` from the Bearer token, loads roles/permissions from the database, and writes a `PERMISSION_DENIED` audit row for every denial:
  - in enforcement mode: raises 401 for missing/invalid credentials and 403 for insufficient permissions, using the existing `{"detail": ...}` error shape;
  - in shadow mode: serves the request and records the denial with a `shadow mode:` detail prefix.
- New endpoints (`/api/auth/me`, `/api/auth/logout`, `/api/auth/change-password`, `/api/auth/users`, `/api/audit`) use `auth.current_principal` and `auth.require_strict_permission`, so they require a token and the exact permission even in shadow mode. No anonymous registration path exists.
- Users with `must_change_password=1` are not redirected and not blocked from protected business APIs. Successful login goes directly to the Dashboard; API access is governed only by the permission check below.
- `/api/health` remains public but no longer discloses the database path.

## Managing users and roles

Only an administrator may call:

```
POST   /api/auth/users
GET    /api/auth/users
PATCH  /api/auth/users/{user_id}
POST   /api/auth/users/{user_id}/reset-password
```

`POST /api/auth/change-password` is available to any authenticated user and only changes that user's password; extra fields such as `user_id` are rejected. The `roles` array must contain at least one of `administrator`, `operator`, `laboratory`, `ehs_reviewer`. Role changes take effect on the next request because permissions are loaded per request, not stored in the token. The optional password change is available in account settings for all authenticated roles and does not alter RBAC enforcement.

## Tests

`backend/tests/test_rbac.py` asserts the seeded matrix, shadow-mode compatibility, enforcement-mode 401/403 responses, role-specific write permissions and strict authentication for new endpoints.
