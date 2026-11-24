"""FastAPI routes. All persistence is delegated to app.db."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException

from . import db
from .schemas import (
    ComplianceCreate,
    CompliancePatch,
    GenerationIn,
    DisposalIn,
    HandlingIn,
    LabIn,
    TechnologySettingsIn,
)

router = APIRouter(prefix="/api")


def require_found(record: dict | None, label: str) -> dict:
    if record is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return record


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "database": str(db.DB_PATH)}


# ---------------------------------------------------------------------------
# Module 02 — sludge generation
# ---------------------------------------------------------------------------
@router.get("/generation")
def list_generation() -> list[dict]:
    return db.fetch_all("SELECT * FROM generation_records ORDER BY date DESC, id DESC")


@router.post("/generation", status_code=201)
def add_generation(payload: GenerationIn) -> dict:
    return db.insert("generation_records", {**payload.model_dump(), "source": "user"})


@router.delete("/generation/{record_id}")
def remove_generation(record_id: int) -> dict:
    if not db.delete("generation_records", record_id):
        raise HTTPException(status_code=404, detail="Record not found")
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 03 — characterisation
# ---------------------------------------------------------------------------
@router.get("/characterisation")
def list_lab() -> list[dict]:
    return db.fetch_all("SELECT * FROM lab_records ORDER BY date DESC, id DESC")


@router.post("/characterisation", status_code=201)
def add_lab(payload: LabIn) -> dict:
    return db.insert("lab_records", {**payload.model_dump(), "source": "user"})


@router.delete("/characterisation/{record_id}")
def remove_lab(record_id: int) -> dict:
    if not db.delete("lab_records", record_id):
        raise HTTPException(status_code=404, detail="Record not found")
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 04 — sludge handling
# ---------------------------------------------------------------------------
@router.get("/handling")
def list_handling() -> list[dict]:
    return db.fetch_all("SELECT * FROM handling_runs ORDER BY date DESC, id DESC")


@router.post("/handling", status_code=201)
def add_handling(payload: HandlingIn) -> dict:
    return db.insert("handling_runs", {**payload.model_dump(), "source": "user"})


@router.delete("/handling/{record_id}")
def remove_handling(record_id: int) -> dict:
    if not db.delete("handling_runs", record_id):
        raise HTTPException(status_code=404, detail="Run not found")
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Disposal records (dashboard / compliance / reports)
# ---------------------------------------------------------------------------
@router.get("/disposals")
def list_disposals() -> list[dict]:
    return db.fetch_all("SELECT * FROM disposal_records ORDER BY date DESC, id DESC")


@router.post("/disposals", status_code=201)
def add_disposal(payload: DisposalIn) -> dict:
    return db.insert("disposal_records", {**payload.model_dump(), "source": "user"})


@router.delete("/disposals/{record_id}")
def remove_disposal(record_id: int) -> dict:
    if not db.delete("disposal_records", record_id):
        raise HTTPException(status_code=404, detail="Record not found")
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 06 — compliance
# ---------------------------------------------------------------------------
@router.get("/compliance")
def list_compliance() -> list[dict]:
    return db.fetch_all("SELECT * FROM compliance_items ORDER BY id")


@router.post("/compliance", status_code=201)
def add_compliance(payload: ComplianceCreate) -> dict:
    return db.insert("compliance_items", payload.model_dump())


@router.patch("/compliance/{record_id}")
def patch_compliance(record_id: int, payload: CompliancePatch) -> dict:
    values = {key: value for key, value in payload.model_dump().items() if value is not None}
    if not values:
        raise HTTPException(status_code=400, detail="No fields to update")
    values["updated_at"] = datetime.now().isoformat(timespec="seconds")
    return require_found(db.update("compliance_items", record_id, values), "Item")


@router.delete("/compliance/{record_id}")
def remove_compliance(record_id: int) -> dict:
    if not db.delete("compliance_items", record_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 05 — technology selection settings
# ---------------------------------------------------------------------------
def technology_settings() -> dict:
    row = db.fetch_one("SELECT * FROM technology_settings WHERE id = 1")
    if row is None:
        sample = json.loads(db.SAMPLE_PATH.read_text(encoding="utf-8"))["technology"]
        return {**sample, "updated_at": None}
    return {
        "weights": json.loads(row["weights"]),
        "scores": json.loads(row["scores"]),
        "updated_at": row["updated_at"],
    }


@router.get("/technology")
def get_technology() -> dict:
    return technology_settings()


@router.put("/technology")
def save_technology(payload: TechnologySettingsIn) -> dict:
    now = datetime.now().isoformat(timespec="seconds")
    weights = json.dumps(payload.weights)
    scores = json.dumps(payload.scores)
    with db.connect() as conn:
        conn.execute(
            """INSERT INTO technology_settings (id, weights, scores, updated_at)
               VALUES (1, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET weights=excluded.weights,
               scores=excluded.scores, updated_at=excluded.updated_at""",
            (weights, scores, now),
        )
    return technology_settings()


# ---------------------------------------------------------------------------
# Dashboard / report data aggregation
# ---------------------------------------------------------------------------
@router.get("/reports/data")
def report_data() -> dict:
    return {
        "generation": list_generation(),
        "characterisation": list_lab(),
        "handling": list_handling(),
        "disposals": list_disposals(),
        "compliance": list_compliance(),
        "technology": technology_settings(),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
