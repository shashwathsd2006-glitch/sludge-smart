# Deployment

## Local development

```bash
python -m pip install -r backend/requirements.txt
python -m pip install -r backend/requirements-dev.txt
npm install
```

Terminal 1:

```bash
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Terminal 2:

```bash
npm run dev
```

Open `http://localhost:5300`. API docs are at `http://localhost:8000/docs`.

`python start.py` remains available as the Windows convenience launcher.

## Production-style frontend build

```bash
npm run build
```

Serve `dist/` through a static web server or reverse proxy and proxy `/api` to the FastAPI service. Set `VITE_API_URL` before building if the API is not at `http://localhost:8000/api`. Latest verified build produced route-level chunks and no 500 kB chunk warning; the remaining large chunks are Recharts and jsPDF.

## Configuration

Configuration is environment-only. See `.env.example` for the non-secret template and `docs/AUTHENTICATION.md` for the full variable reference.

Important defaults:

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_ENFORCEMENT` | `false` | Shadow mode; denials are logged but legacy requests are served. |
| `SLUDGE_SMART_DB_PATH` | `data/sludge_smart.db` | SQLite database location. |
| `TRUSTED_ORIGINS` | localhost ports 5300 and 127.0.0.1 port 5300 | CORS allowlist; no wildcard. |
| `SESSION_TTL_SECONDS` | `28800` | Session lifetime. |
| `PBKDF2_ITERATIONS` | `310000` | Password hash work factor. |
| `MAX_FAILED_ATTEMPTS` | `5` | Failed logins before temporary lockout. |
| `LOCKOUT_SECONDS` | `900` | Lockout window. |

Never commit real bootstrap passwords, password hashes or session tokens. Supply them through the process environment or a secret manager.

## Bootstrap administrator

The administrator is created only when `SLUDGE_SMART_ADMIN_USERNAME` is set and that username does not already exist. Provide one of:

- `SLUDGE_SMART_ADMIN_PASSWORD`
- `SLUDGE_SMART_ADMIN_PASSWORD_HASH`

Do not ship either value in the repository. The created account has `must_change_password=1`; login goes directly to the Dashboard and password change is available from account settings.

## Database procedure

1. Stop the backend before touching the database.
2. Create a timestamped backup directory and copy the database plus any `-wal`/`-shm` files:

   ```bash
   STAMP=$(date +%Y%m%d-%H%M%S)
   mkdir -p "backups/$STAMP"
   cp data/sludge_smart.db* "backups/$STAMP/"
   ```

3. Start the backend; migrations apply automatically and are recorded in `schema_migrations`.
4. Verify integrity and counts with a read-only query:

   ```bash
   sqlite3 'file:data/sludge_smart.db?mode=ro' 'PRAGMA integrity_check; PRAGMA foreign_key_check; SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;'
   ```

5. Roll forward on failure; restore the backup only as a last resort after stopping the backend and moving the current files aside:

   ```bash
   mkdir -p "backups/failed-$STAMP"
   mv data/sludge_smart.db* "backups/failed-$STAMP/"
   cp "backups/$STAMP"/sludge_smart.db* data/
   ```

6. Never reset the database, delete users or rewrite password hashes as a migration workaround.

## PostgreSQL migration strategy

The application is SQLite-first; PostgreSQL is not configured or tested. A future migration should be additive and staged:

1. Keep `SLUDGE_SMART_DB_PATH` on SQLite for the current release; add a separate database URL/configuration layer for PostgreSQL rather than changing endpoint contracts.
2. Translate the schema from `backend/schema.sql` plus `backend/migrations/*.sql` into PostgreSQL DDL, preserving column names, types, keys, indexes and `schema_migrations` version rows.
3. Use a one-way, idempotent migration tool with explicit version tracking. Do not reuse SQLite `INSERT OR IGNORE` semantics without review.
4. Back up SQLite, export rows table-by-table, transform dates to UTC timestamps, import into PostgreSQL inside one transaction, then verify row counts and hash/checksum totals per table.
5. Run the backend test suite against the PostgreSQL connection before cutover. Keep SQLite available for rollback until the new deployment passes read and write verification.
6. Plan shared sessions, distributed lockout and audit correlation separately: `user_sessions` and failed-attempt counters are process-local SQLite assumptions today.

## Enforcement rollout

Keep `AUTH_ENFORCEMENT=false` until all client workflows send Bearer tokens and role coverage has been verified in a browser. The existing local environment remains in shadow mode; do not change it without explicit approval. To roll out in a controlled environment:

1. Confirm every expected role can log in directly to the Dashboard and optionally change its password from account settings.
2. Confirm role-specific create/update/delete access in shadow mode.
3. Review `GET /api/audit` permission denials.
4. Set `AUTH_ENFORCEMENT=true` in a controlled environment.
5. Recheck all seven modules and the auth/user endpoints.
6. Roll back the flag if a needed permission is missing rather than editing data by hand.

## Operational limits

- SQLite is suitable for a local demo or single-instance deployment. Multiple workers or hosts need a shared session store, shared failed-attempt/lockout counters and a shared transactional audit store.
- Session state is stored in browser `sessionStorage` and `user_sessions`; clearing browser data or losing the DB row ends the session.
- Audit retention and archival are not implemented. Define a retention window, export procedure and access controls before production use.
- HTTPS, reverse-proxy headers, process supervision, backups and monitoring are deployment responsibilities.
- No deployment, security-policy change or git-root change should occur without explicit approval.
