# Database schema

## Storage model

SLUDGE SMART uses SQLite at `data/sludge_smart.db` by default. `backend/app/db.py` is the only module that reads or writes the database directly.

- Connections are opened per operation, use `sqlite3.Row`, enable WAL journal mode at startup, enable foreign keys and close explicitly.
- All values are bound parameters. Table names and dynamically generated column names pass allowlist checks before interpolation.
- `db.transaction()` commits on success and rolls back on any exception.
- Business changes and their audit rows share one transaction.
- `source='sample'` marks illustrative records loaded from `shared/sample-data.json`; `source='user'` marks user-entered records.

## Original business tables

### `generation_records`

`id`, `date`, `wastewater_m3`, `wet_sludge_kg`, `moisture_pct`, `operating_days`, `source`, `created_at`.

### `lab_records`

`id`, `date`, `sample_id`, `ph`, `moisture_pct`, `total_solids_pct`, `volatile_solids_pct`, `oil_grease_mgkg`, `cod_mgl`, `lead_mgkg`, `chromium_mgkg`, `cadmium_mgkg`, `nickel_mgkg`, `other_contaminants`, `source`, `created_at`.

### `handling_runs`

`id`, `date`, `process_group`, `technology`, `initial_mass_kg`, `initial_moisture_pct`, `final_moisture_pct`, `source`, `created_at`.

### `disposal_records`

`id`, `date`, `quantity_kg`, `facility`, `manifest_no`, `transport_mode`, `source`, `created_at`.

### `compliance_items`

`id`, `area`, `requirement`, `detail`, `status`, `due_date`, `note`, `updated_at`.

### `technology_settings`

`id` fixed to 1, `weights` and `scores` stored as JSON text, `updated_at`.

## Authentication and audit tables

### `users`

Stores username, PBKDF2 password hash, profile fields, active flag, forced-password-change flag, lockout counters, login timestamps and created/updated timestamps.

### `roles`, `permissions`, `user_roles`, `role_permissions`

Seeded role and permission definitions plus many-to-many links. Roles are `administrator`, `operator`, `laboratory` and `ehs_reviewer`. Permission codes cover generation, lab, handling, disposal, compliance, technology, reports, audit and users.

### `user_sessions`

Stores only SHA-256 token hashes with expiry and revocation timestamps. Raw Bearer tokens are never stored.

### `audit_logs`

Append-only event log with UTC timestamp, actor snapshot, action, resource, record ID, before/after JSON, changed fields, outcome, detail, request metadata and request ID. Triggers abort UPDATE and DELETE.

### `schema_migrations`

Records applied migration versions and application timestamps.

## Migrations

Migrations are additive, version-tracked SQL files in `backend/migrations/`:

- `001_phase1.sql` adds users, roles, permissions, sessions, audit logs and related indexes/triggers.
- `002_password_management.sql` adds nullable `users.password_changed_at`.
- `003_completion_additions.sql` adds indexes only:
  - `idx_generation_records_date_source`
  - `idx_lab_records_date`
  - `idx_handling_runs_date`
  - `idx_disposal_records_date`
  - `idx_compliance_items_status`

The completion migration intentionally does not add `updated_at` columns to business tables: SQLite rejects `CURRENT_TIMESTAMP` as a non-constant `ADD COLUMN` default, and API compatibility tests require existing response keys to remain exact.

## Safety rules

- Do not hand-edit the live database.
- Do not reset or delete the database to fix a problem.
- Back up the database, including WAL/SHM files if present, before any migration procedure.
- Migration files must not contain destructive operations such as DROP, DELETE, RENAME or destructive ALTER TABLE.
- Use `SLUDGE_SMART_DB_PATH` to point tests or isolated deployments at a separate database file.
