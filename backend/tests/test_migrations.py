from app import audit, db, migrations

BASE_TABLES = (
    "generation_records", "lab_records", "handling_runs",
    "disposal_records", "compliance_items", "technology_settings",
)
NEW_TABLES = (
    "users", "roles", "permissions", "user_roles", "role_permissions",
    "user_sessions", "audit_logs", "schema_migrations",
)


def counts():
    return {table: db.fetch_one(f"SELECT COUNT(*) AS n FROM {table}")["n"] for table in BASE_TABLES}


def test_migration_is_additive_idempotent_and_preserves_records(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "legacy.db")
    db.init_db()
    with db.transaction() as conn:
        conn.execute(
            """INSERT INTO generation_records
               (date, wastewater_m3, wet_sludge_kg, moisture_pct, operating_days, source)
               VALUES ('2026-11-27', 10, 20, 90, 1, 'user')"""
        )
    before = counts()

    assert migrations.run_migrations() == [
        "001_phase1", "002_password_management", "003_completion_additions", "004_compliance_records",
    ]
    assert counts() == before
    assert migrations.applied_versions() == [
        "001_phase1", "002_password_management", "003_completion_additions", "004_compliance_records",
    ]

    with db.transaction() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    assert "password_changed_at" in columns

    names = {row["name"] for row in db.fetch_all("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert set(BASE_TABLES + NEW_TABLES) <= names

    indexes = {row["name"] for row in db.fetch_all("SELECT name FROM sqlite_master WHERE type = 'index'")}
    assert {
        "idx_user_sessions_user", "idx_audit_logs_timestamp",
        "idx_audit_logs_resource_record", "idx_generation_records_date_source",
        "idx_lab_records_date", "idx_handling_runs_date",
        "idx_disposal_records_date", "idx_compliance_items_status",
    } <= indexes

    triggers = {row["name"] for row in db.fetch_all("SELECT name FROM sqlite_master WHERE type = 'trigger'")}
    assert {"audit_logs_no_update", "audit_logs_no_delete"} <= triggers

    with db.transaction() as conn:
        conn.execute(
            """INSERT INTO users (username, password_hash, full_name, email)
               VALUES ('existing', 'pbkdf2_sha256$1$a$b', '', '')"""
        )
        audit.record_audit(
            conn, actor=None, action="LOGIN", resource="auth", detail="pre-rerun"
        )
    assert migrations.run_migrations() == []
    assert counts() == before
    assert db.fetch_one("SELECT COUNT(*) AS n FROM users")["n"] == 1
    assert db.fetch_one("SELECT COUNT(*) AS n FROM audit_logs")["n"] == 1
    assert migrations.applied_versions() == [
        "001_phase1", "002_password_management", "003_completion_additions", "004_compliance_records",
    ]


def test_foreign_keys_are_enforced(tmp_path, monkeypatch):
    import sqlite3

    monkeypatch.setattr(db, "DB_PATH", tmp_path / "fk.db")
    db.init_db()
    migrations.run_migrations()
    with db.transaction() as conn:
        try:
            conn.execute(
                "INSERT INTO user_roles (user_id, role_id) VALUES (999, 1)"
            )
            assert False, "foreign key should have been enforced"
        except sqlite3.IntegrityError:
            pass
