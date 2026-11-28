# Database migrations

Phase 1 uses additive, version-tracked SQLite migrations. The six original tables and all of their records are preserved.

## How it works

1. `db.init_db()` still creates the original six tables with `CREATE TABLE IF NOT EXISTS` and seeds sample data when all five data tables are empty.
2. `migrations.run_migrations()` then reads `backend/migrations/*.sql` in filename order. Each file is split on `-- @@`; every statement runs inside one transaction.
3. `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT)` records applied versions. Re-running startup skips already-applied files.
4. Startup finally calls `auth.ensure_bootstrap_admin()`, which creates the environment-configured administrator only if that username does not already exist.

`db.transaction()` commits on success and rolls back on any exception. `db.insert/update/delete/fetch_*` accept an optional connection so a business change and its audit row share one transaction. Connections are explicitly closed.

## Version 001_phase1

Adds, without altering existing tables:

- `users` — unique username, PBKDF2 hash, active/lockout flags, timestamps.
- `roles`, `permissions`, `user_roles`, `role_permissions` — four roles and 21 permission codes with composite primary keys and foreign keys.
- `user_sessions` — unique token hash, user FK, expiry and revocation timestamps.
- `audit_logs` — append-only event table with actor, action, resource, record, before/after JSON and correlation ID.
- Indexes on session expiry/user, audit timestamp/resource+record/actor/action, and join tables.
- Triggers that abort any UPDATE or DELETE on `audit_logs`.
- Idempotent `INSERT OR IGNORE` seed data for roles, permissions and role→permission links.

All foreign keys use `PRAGMA foreign_keys = ON`; join tables and sessions cascade on user deletion, while audit rows keep the username snapshot and null the user ID.

## Version 002_password_management

Adds one nullable column to the existing `users` table:

- `password_changed_at TEXT` — UTC timestamp of the last password set/reset. Existing rows keep `NULL`; no records are deleted or reset.

`POST /api/auth/change-password`, `POST /api/auth/users/{id}/reset-password`, user creation and bootstrap administrator creation populate it. `UserOut` and all existing API response shapes are unchanged.

## Version 003_completion_additions

Adds indexes only; no columns, tables, records or response shapes change:

- `idx_generation_records_date_source`
- `idx_lab_records_date`
- `idx_handling_runs_date`
- `idx_disposal_records_date`
- `idx_compliance_items_status`

An earlier draft tried to add `updated_at` columns with `CURRENT_TIMESTAMP`; SQLite rejected that non-constant default and the compatibility tests require existing response keys to remain exact, so those columns were intentionally removed.

## Procedure for a populated database

1. Stop the backend.
2. Copy the database file to a timestamped backup (include `-wal`/`-shm` files if present).
3. Start the backend; the migrations apply automatically and record `001_phase1`, `002_password_management` and `003_completion_additions`.
4. Verify with:

```python
from app import db, migrations
print(migrations.applied_versions())
print(db.fetch_one("SELECT COUNT(*) AS n FROM generation_records"))
```

5. Roll forward if a problem is found; do not use destructive down-migrations. Restore the backup only as a last resort, acknowledging that records created after the backup will be lost.

## Safety rules

- Migration files must never contain `DROP`, `DELETE`, `RENAME`, or destructive `ALTER TABLE` on existing tables. Additive `ALTER TABLE ... ADD COLUMN` is allowed, as in `002_password_management.sql`.
- Tests run migrations against temporary copies in `tmp_path`; the live `data/sludge_smart.db` is never used by the test suite.
- `backend/tests/test_migrations.py` verifies row-count preservation, idempotence, new tables/indexes/triggers and foreign-key enforcement.

## Configuration

Set `SLUDGE_SMART_DB_PATH` to move the database file (useful for isolated deployments and tests). The default remains `<project>/data/sludge_smart.db`.
