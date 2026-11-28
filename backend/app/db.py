"""SQLite connection, schema and sample-data seeding for SLUDGE SMART.

All database logic lives here so API routes and the frontend never talk to
SQLite directly. Records created by a user are marked source='user'; records
loaded from shared/sample-data.json are marked source='sample' and are clearly
labelled as illustrative in the interface.
"""

from __future__ import annotations

import json
import re
import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path

from .config import DB_PATH

ROOT = Path(__file__).resolve().parents[2]
SAMPLE_PATH = ROOT / "shared" / "sample-data.json"

ALLOWED_TABLES = frozenset(
    {
        "generation_records",
        "lab_records",
        "handling_runs",
        "disposal_records",
        "compliance_items",
        "technology_settings",
        "users",
        "roles",
        "permissions",
        "user_roles",
        "role_permissions",
        "user_sessions",
        "audit_logs",
        "schema_migrations",
    }
)
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS generation_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    wastewater_m3 REAL NOT NULL,
    wet_sludge_kg REAL NOT NULL,
    moisture_pct REAL NOT NULL,
    operating_days REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lab_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    sample_id TEXT NOT NULL,
    ph REAL,
    moisture_pct REAL,
    total_solids_pct REAL,
    volatile_solids_pct REAL,
    oil_grease_mgkg REAL,
    cod_mgl REAL,
    lead_mgkg REAL,
    chromium_mgkg REAL,
    cadmium_mgkg REAL,
    nickel_mgkg REAL,
    other_contaminants TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS handling_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    process_group TEXT NOT NULL,
    technology TEXT NOT NULL,
    initial_mass_kg REAL NOT NULL,
    initial_moisture_pct REAL NOT NULL,
    final_moisture_pct REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disposal_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    quantity_kg REAL NOT NULL,
    facility TEXT NOT NULL,
    manifest_no TEXT NOT NULL,
    transport_mode TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00+00:00',
    updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS compliance_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL,
    requirement TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Information missing',
    due_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS technology_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    weights TEXT NOT NULL,
    scores TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def validate_table(table: str) -> str:
    if table not in ALLOWED_TABLES:
        raise ValueError(f"table not allowed: {table}")
    return table


def validate_columns(columns) -> tuple[str, ...]:
    names = tuple(str(name) for name in columns)
    if not names or any(not _IDENTIFIER.fullmatch(name) for name in names):
        raise ValueError("invalid column name")
    if len(set(names)) != len(names):
        raise ValueError("duplicate column name")
    return names


@contextmanager
def _use(conn: sqlite3.Connection | None):
    if conn is not None:
        yield conn
        return
    with closing(connect()) as connection:
        with connection:
            yield connection


@contextmanager
def transaction() -> sqlite3.Connection:
    with closing(connect()) as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def init_db() -> None:
    with transaction() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        empty = all(
            conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
            for table in (
                "generation_records",
                "lab_records",
                "handling_runs",
                "disposal_records",
                "compliance_items",
            )
        )
        if empty:
            seed(conn)


def seed(conn: sqlite3.Connection) -> None:
    sample = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))

    for row in sample["generation"]:
        conn.execute(
            """INSERT INTO generation_records
               (date, wastewater_m3, wet_sludge_kg, moisture_pct, operating_days, source)
               VALUES (:date, :wastewater_m3, :wet_sludge_kg, :moisture_pct, :operating_days, 'sample')""",
            row,
        )

    for row in sample["lab"]:
        conn.execute(
            """INSERT INTO lab_records
               (date, sample_id, ph, moisture_pct, total_solids_pct, volatile_solids_pct,
                oil_grease_mgkg, cod_mgl, lead_mgkg, chromium_mgkg, cadmium_mgkg,
                nickel_mgkg, other_contaminants, source)
               VALUES (:date, :sample_id, :ph, :moisture_pct, :total_solids_pct,
                :volatile_solids_pct, :oil_grease_mgkg, :cod_mgl, :lead_mgkg,
                :chromium_mgkg, :cadmium_mgkg, :nickel_mgkg, :other_contaminants, 'sample')""",
            row,
        )

    for row in sample["handling"]:
        conn.execute(
            """INSERT INTO handling_runs
               (date, process_group, technology, initial_mass_kg, initial_moisture_pct,
                final_moisture_pct, source)
               VALUES (:date, :process_group, :technology, :initial_mass_kg,
                :initial_moisture_pct, :final_moisture_pct, 'sample')""",
            row,
        )

    for row in sample["disposal"]:
        conn.execute(
            """INSERT INTO disposal_records
               (date, quantity_kg, facility, manifest_no, transport_mode, source)
               VALUES (:date, :quantity_kg, :facility, :manifest_no, :transport_mode, 'sample')""",
            row,
        )

    for row in sample["compliance"]:
        conn.execute(
            """INSERT INTO compliance_items
               (id, area, requirement, detail, status, due_date, note, source, created_at, updated_at, updated_by)
               VALUES (:id, :area, :requirement, :detail, :status, :due_date, :note, 'sample', '1970-01-01T00:00:00+00:00', '1970-01-01T00:00:00+00:00', '')""",
            row,
        )

    tech = sample["technology"]
    conn.execute(
        """INSERT OR REPLACE INTO technology_settings (id, weights, scores)
           VALUES (1, ?, ?)""",
        (json.dumps(tech["weights"]), json.dumps(tech["scores"])),
    )


def fetch_all(query: str, params: tuple = (), conn: sqlite3.Connection | None = None) -> list[dict]:
    if not query.lstrip().upper().startswith("SELECT"):
        raise ValueError("fetch_all accepts SELECT statements only")
    with _use(conn) as connection:
        return [dict(row) for row in connection.execute(query, params).fetchall()]


def fetch_one(query: str, params: tuple = (), conn: sqlite3.Connection | None = None) -> dict | None:
    if not query.lstrip().upper().startswith("SELECT"):
        raise ValueError("fetch_one accepts SELECT statements only")
    with _use(conn) as connection:
        row = connection.execute(query, params).fetchone()
        return dict(row) if row else None


def insert(table: str, values: dict, conn: sqlite3.Connection | None = None) -> dict:
    validate_table(table)
    names = validate_columns(values.keys())
    columns = ", ".join(names)
    placeholders = ", ".join(f":{name}" for name in names)
    with _use(conn) as connection:
        cursor = connection.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", values
        )
        new_id = cursor.lastrowid
        return fetch_one(f"SELECT * FROM {table} WHERE id = ?", (new_id,), conn=connection)


def update(
    table: str, record_id: int, values: dict, conn: sqlite3.Connection | None = None
) -> dict | None:
    validate_table(table)
    names = validate_columns(values.keys())
    assignments = ", ".join(f"{name} = :{name}" for name in names)
    params = {"id": record_id, **values}
    with _use(conn) as connection:
        connection.execute(f"UPDATE {table} SET {assignments} WHERE id = :id", params)
        return fetch_one(f"SELECT * FROM {table} WHERE id = ?", (record_id,), conn=connection)


def delete(table: str, record_id: int, conn: sqlite3.Connection | None = None) -> bool:
    validate_table(table)
    with _use(conn) as connection:
        cursor = connection.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))
        return cursor.rowcount > 0
