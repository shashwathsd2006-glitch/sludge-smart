"""SQLite connection, schema and sample-data seeding for SLUDGE SMART.

All database logic lives here so API routes and the frontend never talk to
SQLite directly. Records created by a user are marked source='user'; records
loaded from shared/sample-data.json are marked source='sample' and are clearly
labelled as illustrative in the interface.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data" / "sludge_smart.db"
SAMPLE_PATH = ROOT / "shared" / "sample-data.json"

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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compliance_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL,
    requirement TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Information missing',
    due_date TEXT,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    return conn


def init_db() -> None:
    with connect() as conn:
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
               (id, area, requirement, detail, status, due_date, note)
               VALUES (:id, :area, :requirement, :detail, :status, :due_date, :note)""",
            row,
        )

    tech = sample["technology"]
    conn.execute(
        """INSERT OR REPLACE INTO technology_settings (id, weights, scores)
           VALUES (1, ?, ?)""",
        (json.dumps(tech["weights"]), json.dumps(tech["scores"])),
    )


def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    with connect() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def fetch_one(query: str, params: tuple = ()) -> dict | None:
    with connect() as conn:
        row = conn.execute(query, params).fetchone()
        return dict(row) if row else None


def insert(table: str, values: dict) -> dict:
    columns = ", ".join(values.keys())
    placeholders = ", ".join(f":{key}" for key in values)
    with connect() as conn:
        cursor = conn.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", values
        )
        new_id = cursor.lastrowid
    return fetch_one(f"SELECT * FROM {table} WHERE id = ?", (new_id,))


def update(table: str, record_id: int, values: dict) -> dict | None:
    assignments = ", ".join(f"{key} = :{key}" for key in values)
    params = {"id": record_id, **values}
    with connect() as conn:
        conn.execute(f"UPDATE {table} SET {assignments} WHERE id = :id", params)
    return fetch_one(f"SELECT * FROM {table} WHERE id = ?", (record_id,))


def delete(table: str, record_id: int) -> bool:
    with connect() as conn:
        cursor = conn.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))
        return cursor.rowcount > 0
