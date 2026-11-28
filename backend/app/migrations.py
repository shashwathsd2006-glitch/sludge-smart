"""Version-tracked, additive-only SQLite migration runner.

Migrations run at application startup after :func:`app.db.init_db`. A migration
is applied once, recorded in ``schema_migrations``, and executed inside a single
transaction. Migration files never contain destructive statements.
"""

from __future__ import annotations

from pathlib import Path

from . import db

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def _statements(sql_text: str) -> list[str]:
    blocks = []
    for block in sql_text.split("-- @@"):
        block = block.strip()
        if not block:
            continue
        if all(line.strip().startswith("--") or not line.strip() for line in block.splitlines()):
            continue
        blocks.append(block)
    return blocks


def applied_versions() -> list[str]:
    with db.transaction() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                   version TEXT PRIMARY KEY,
                   applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
               )"""
        )
        return [row[0] for row in conn.execute("SELECT version FROM schema_migrations ORDER BY version")]


def run_migrations() -> list[str]:
    applied: list[str] = []
    with db.transaction() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                   version TEXT PRIMARY KEY,
                   applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
               )"""
        )
        done = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            version = path.stem
            if version in done:
                continue
            for statement in _statements(path.read_text(encoding="utf-8")):
                try:
                    conn.execute(statement)
                except Exception as exc:
                    msg = str(exc).lower()
                    if "duplicate column name" in msg or "already exists" in msg:
                        pass
                    else:
                        raise
            conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
            applied.append(version)
    return applied
