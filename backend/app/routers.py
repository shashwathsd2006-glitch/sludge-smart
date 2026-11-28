"""FastAPI routes. All persistence is delegated to app.db.

Legacy endpoints keep their original paths, request models and response
shapes. Permission dependencies run in shadow mode by default and become
blocking when AUTH_ENFORCEMENT=true.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from . import audit, auth, db
from .schemas import (
    ComplianceCheckpointIn,
    ComplianceCreate,
    CompliancePatch,
    ConsignmentIn,
    DisposalIn,
    DisposalPatch,
    GenerationIn,
    GenerationPatch,
    HandlingIn,
    HandlingPatch,
    LabIn,
    LabPatch,
    TechnologySettingsIn,
    valid_date,
)

router = APIRouter(prefix="/api")

DEFAULT_ORDER = "date DESC, id DESC"
HANDLING_ORDER = (
    "CASE process_group "
    "WHEN 'Thickening' THEN 1 WHEN 'Dewatering' THEN 2 WHEN 'Drying' THEN 3 ELSE 4 END ASC, "
    "date DESC, id DESC"
)


def require_found(record: dict | None, label: str) -> dict:
    if record is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return record


def _actor(principal: Optional[auth.Principal]) -> Optional[dict]:
    return principal.as_actor() if principal else None


_UNIQUE_FIELDS = {
    "lab_records": ("sample_id", "Sample ID"),
    "disposal_records": ("manifest_no", "Manifest number"),
}


def _ensure_unique(conn, table: str, values: dict, record_id: Optional[int] = None) -> None:
    field = _UNIQUE_FIELDS.get(table)
    if field is None:
        return
    column, label = field
    if column not in values:
        return
    row = db.fetch_one(
        f"SELECT id FROM {table} WHERE {column} = ? AND id <> ?",
        (values[column], record_id if record_id is not None else -1),
        conn=conn,
    )
    if row is not None:
        raise HTTPException(status_code=409, detail=f"{label} already exists")


def _merged_payload(model, existing: dict, patch) -> dict:
    values = {key: existing.get(key) for key in model.model_fields}
    values.update(patch.model_dump(exclude_unset=True))
    return values


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _filtered_rows(
    table: str,
    date_from: Optional[str],
    date_to: Optional[str],
    source: Optional[str],
    limit: Optional[int],
    offset: int,
    order_by: str = DEFAULT_ORDER,
) -> list[dict]:
    table = db.validate_table(table)
    clauses = []
    params: dict = {}
    if date_from:
        try:
            valid_date(date_from)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="date_from must be YYYY-MM-DD") from exc
        clauses.append("date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        try:
            valid_date(date_to)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="date_to must be YYYY-MM-DD") from exc
        clauses.append("date <= :date_to")
        params["date_to"] = date_to
    if source:
        if source not in {"sample", "user"}:
            raise HTTPException(status_code=400, detail="Unknown source")
        clauses.append("source = :source")
        params["source"] = source
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    params["limit"] = -1 if limit is None else limit
    params["offset"] = offset
    return db.fetch_all(
        f"SELECT * FROM {table}{where} ORDER BY {order_by} LIMIT :limit OFFSET :offset",
        params,
    )


def _patch_record(
    table: str,
    record_id: int,
    payload,
    request: Request,
    principal: Optional[auth.Principal],
    label: str,
) -> dict:
    values = payload.model_dump()
    with db.transaction() as conn:
        before = db.fetch_one(f"SELECT * FROM {table} WHERE id = ?", (record_id,), conn=conn)
        if before is None:
            raise HTTPException(status_code=404, detail=f"{label} not found")
        _ensure_unique(conn, table, values, record_id)
        record = db.update(table, record_id, values, conn=conn)
        audit.record_audit(
            conn,
            actor=_actor(principal),
            action="UPDATE",
            resource=table,
            record_id=record_id,
            before=before,
            after=record,
            changed_fields=audit.changed_keys(before, record),
            request=request,
        )
    return record


@router.get("/health")
def health() -> dict:
    try:
        db.fetch_one("SELECT 1 AS ok")
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok", "database": "connected"}


# ---------------------------------------------------------------------------
# Module 02 — sludge generation
# ---------------------------------------------------------------------------
@router.get("/generation")
def list_generation(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    source: Optional[str] = Query(default=None, max_length=10),
    limit: Optional[int] = Query(default=None, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("generation:read")),
) -> list[dict]:
    return _filtered_rows("generation_records", date_from, date_to, source, limit, offset)


@router.post("/generation", status_code=201)
def add_generation(
    payload: GenerationIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("generation:write")),
) -> dict:
    now = _utc_now()
    values = {**payload.model_dump(), "source": "user", "created_at": now}
    with db.transaction() as conn:
        record = db.insert("generation_records", values, conn=conn)
        audit.record_audit(
            conn, actor=_actor(principal), action="CREATE", resource="generation_records",
            record_id=record["id"], after=record, request=request,
        )
    return record


@router.patch("/generation/{record_id}")
def patch_generation(
    record_id: int,
    payload: GenerationPatch,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("generation:write")),
) -> dict:
    existing = require_found(db.fetch_one("SELECT * FROM generation_records WHERE id = ?", (record_id,)), "Record")
    validated = GenerationIn(**_merged_payload(GenerationIn, existing, payload))
    return _patch_record("generation_records", record_id, validated, request, principal, "Record")


@router.delete("/generation/{record_id}")
def remove_generation(
    record_id: int,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("generation:delete")),
) -> dict:
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM generation_records WHERE id = ?", (record_id,), conn=conn)
        if not db.delete("generation_records", record_id, conn=conn):
            raise HTTPException(status_code=404, detail="Record not found")
        audit.record_audit(
            conn, actor=_actor(principal), action="DELETE", resource="generation_records",
            record_id=record_id, before=before, request=request,
        )
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 03 — characterisation
# ---------------------------------------------------------------------------
@router.get("/characterisation")
def list_lab(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    source: Optional[str] = Query(default=None, max_length=10),
    limit: Optional[int] = Query(default=None, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("lab:read")),
) -> list[dict]:
    return _filtered_rows("lab_records", date_from, date_to, source, limit, offset)


@router.post("/characterisation", status_code=201)
def add_lab(
    payload: LabIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("lab:write")),
) -> dict:
    now = _utc_now()
    values = {**payload.model_dump(), "source": "user", "created_at": now}
    with db.transaction() as conn:
        _ensure_unique(conn, "lab_records", values)
        record = db.insert("lab_records", values, conn=conn)
        audit.record_audit(
            conn, actor=_actor(principal), action="CREATE", resource="lab_records",
            record_id=record["id"], after=record, request=request,
        )
    return record


@router.patch("/characterisation/{record_id}")
def patch_lab(
    record_id: int,
    payload: LabPatch,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("lab:write")),
) -> dict:
    existing = require_found(db.fetch_one("SELECT * FROM lab_records WHERE id = ?", (record_id,)), "Record")
    validated = LabIn(**_merged_payload(LabIn, existing, payload))
    return _patch_record("lab_records", record_id, validated, request, principal, "Record")


@router.delete("/characterisation/{record_id}")
def remove_lab(
    record_id: int,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("lab:delete")),
) -> dict:
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM lab_records WHERE id = ?", (record_id,), conn=conn)
        if not db.delete("lab_records", record_id, conn=conn):
            raise HTTPException(status_code=404, detail="Record not found")
        audit.record_audit(
            conn, actor=_actor(principal), action="DELETE", resource="lab_records",
            record_id=record_id, before=before, request=request,
        )
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 04 — sludge handling
# ---------------------------------------------------------------------------
@router.get("/handling")
def list_handling(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    source: Optional[str] = Query(default=None, max_length=10),
    limit: Optional[int] = Query(default=None, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("handling:read")),
) -> list[dict]:
    return _filtered_rows("handling_runs", date_from, date_to, source, limit, offset, HANDLING_ORDER)


@router.post("/handling", status_code=201)
def add_handling(
    payload: HandlingIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("handling:write")),
) -> dict:
    now = _utc_now()
    values = {**payload.model_dump(), "source": "user", "created_at": now}
    with db.transaction() as conn:
        record = db.insert("handling_runs", values, conn=conn)
        audit.record_audit(
            conn, actor=_actor(principal), action="CREATE", resource="handling_runs",
            record_id=record["id"], after=record, request=request,
        )
    return record


@router.patch("/handling/{record_id}")
def patch_handling(
    record_id: int,
    payload: HandlingPatch,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("handling:write")),
) -> dict:
    existing = require_found(db.fetch_one("SELECT * FROM handling_runs WHERE id = ?", (record_id,)), "Run")
    validated = HandlingIn(**_merged_payload(HandlingIn, existing, payload))
    return _patch_record("handling_runs", record_id, validated, request, principal, "Run")


@router.delete("/handling/{record_id}")
def remove_handling(
    record_id: int,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("handling:delete")),
) -> dict:
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM handling_runs WHERE id = ?", (record_id,), conn=conn)
        if not db.delete("handling_runs", record_id, conn=conn):
            raise HTTPException(status_code=404, detail="Run not found")
        audit.record_audit(
            conn, actor=_actor(principal), action="DELETE", resource="handling_runs",
            record_id=record_id, before=before, request=request,
        )
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Disposal records (dashboard / compliance / reports)
# ---------------------------------------------------------------------------
@router.get("/disposals")
def list_disposals(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    source: Optional[str] = Query(default=None, max_length=10),
    limit: Optional[int] = Query(default=None, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:read")),
) -> list[dict]:
    return _filtered_rows("disposal_records", date_from, date_to, source, limit, offset)


@router.post("/disposals", status_code=201)
def add_disposal(
    payload: DisposalIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:write")),
) -> dict:
    now = _utc_now()
    values = {
        **payload.model_dump(),
        "source": "user",
        "created_at": now,
        "updated_at": now,
        "updated_by": principal.username if principal else "anonymous",
    }
    with db.transaction() as conn:
        _ensure_unique(conn, "disposal_records", values)
        record = db.insert("disposal_records", values, conn=conn)
        audit.record_audit(
            conn, actor=_actor(principal), action="CREATE", resource="disposal_records",
            record_id=record["id"], after=record, request=request,
        )
    return record


@router.patch("/disposals/{record_id}")
def patch_disposal(
    record_id: int,
    payload: DisposalPatch,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:write")),
) -> dict:
    existing = require_found(db.fetch_one("SELECT * FROM disposal_records WHERE id = ?", (record_id,)), "Record")
    validated = DisposalIn(**_merged_payload(DisposalIn, existing, payload))
    values = validated.model_dump()
    values["updated_at"] = _utc_now()
    values["updated_by"] = principal.username if principal else "anonymous"
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM disposal_records WHERE id = ?", (record_id,), conn=conn)
        _ensure_unique(conn, "disposal_records", values, record_id)
        record = db.update("disposal_records", record_id, values, conn=conn)
        record = require_found(record, "Record")
        audit.record_audit(
            conn, actor=_actor(principal), action="UPDATE", resource="disposal_records",
            record_id=record_id, before=before, after=record,
            changed_fields=audit.changed_keys(before, record), request=request,
        )
    return record


@router.delete("/disposals/{record_id}")
def remove_disposal(
    record_id: int,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:delete")),
) -> dict:
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM disposal_records WHERE id = ?", (record_id,), conn=conn)
        if not db.delete("disposal_records", record_id, conn=conn):
            raise HTTPException(status_code=404, detail="Record not found")
        audit.record_audit(
            conn, actor=_actor(principal), action="DELETE", resource="disposal_records",
            record_id=record_id, before=before, request=request,
        )
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 06 — compliance
# ---------------------------------------------------------------------------
def _compliance_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "area": row["area"],
        "requirement": row["requirement"],
        "detail": row.get("detail", ""),
        "current_evidence": row.get("detail", ""),
        "status": row["status"],
        "due_date": row.get("due_date"),
        "note": row.get("note", ""),
        "source": row.get("source", "user"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updated_by": row.get("updated_by", ""),
    }


def _compliance_item(row: dict) -> dict:
    return {
        "id": row["id"],
        "area": row["area"],
        "requirement": row["requirement"],
        "detail": row.get("detail", ""),
        "status": row["status"],
        "due_date": row.get("due_date"),
        "note": row.get("note", ""),
        "source": row.get("source", "user"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updated_by": row.get("updated_by", ""),
    }


def _consignment_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "date": row["date"],
        "quantity_kg": row["quantity_kg"],
        "facility": row["facility"],
        "authorised_facility": row["facility"],
        "manifest_no": row["manifest_no"],
        "manifest_number": row["manifest_no"],
        "transport_mode": row.get("transport_mode", ""),
        "source": row.get("source", "user"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updated_by": row.get("updated_by", ""),
    }


def _compliance_values(payload, actor: Optional[auth.Principal], existing: dict | None = None) -> dict:
    now = _utc_now()
    evidence = payload.evidence_value() if hasattr(payload, "evidence_value") else (payload.current_evidence or "")
    values = {
        "area": payload.area.strip(),
        "requirement": payload.requirement.strip(),
        "detail": evidence.strip(),
        "status": payload.status,
        "due_date": payload.due_date or None,
        "note": payload.note.strip(),
        "updated_at": now,
        "updated_by": actor.username if actor else "anonymous",
    }
    if existing is None:
        values["source"] = "user"
        values["created_at"] = now
    return values


@router.get("/compliance")
def list_compliance(
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:read")),
) -> list[dict]:
    rows = db.fetch_all("SELECT * FROM compliance_items ORDER BY id")
    return [_compliance_item(row) for row in rows]


@router.get("/compliance/checkpoints")
def list_checkpoints(
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:read")),
) -> list[dict]:
    rows = db.fetch_all("SELECT * FROM compliance_items ORDER BY id")
    return [_compliance_out(row) for row in rows]


@router.post("/compliance", status_code=201)
def add_compliance(
    payload: ComplianceCreate,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:write")),
) -> dict:
    now = _utc_now()
    values = {
        **payload.model_dump(),
        "source": "user",
        "created_at": now,
        "updated_at": now,
        "updated_by": principal.username if principal else "anonymous",
    }
    with db.transaction() as conn:
        record = db.insert("compliance_items", values, conn=conn)
        audit.record_audit(
            conn, actor=_actor(principal), action="CREATE", resource="compliance_items",
            record_id=record["id"], after=record, request=request,
        )
    return _compliance_item(record)


@router.post("/compliance/checkpoints", status_code=201)
def add_checkpoint(
    payload: ComplianceCheckpointIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:write")),
) -> dict:
    values = _compliance_values(payload, principal)
    with db.transaction() as conn:
        record = db.insert("compliance_items", values, conn=conn)
        audit.record_audit(
            conn, actor=_actor(principal), action="CREATE", resource="compliance_items",
            record_id=record["id"], after=record, request=request,
        )
    return _compliance_out(record)


@router.patch("/compliance/{record_id}")
def patch_compliance(
    record_id: int,
    payload: CompliancePatch,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:write")),
) -> dict:
    values = {
        key: value
        for key, value in payload.model_dump(exclude_unset=True).items()
        if key == "due_date" or value is not None
    }
    if not values:
        raise HTTPException(status_code=400, detail="No fields to update")
    values["updated_at"] = _utc_now()
    values["updated_by"] = principal.username if principal else "anonymous"
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM compliance_items WHERE id = ?", (record_id,), conn=conn)
        record = db.update("compliance_items", record_id, values, conn=conn)
        record = require_found(record, "Item")
        action = (
            "APPROVAL"
            if before and before.get("status") != "Compliant" and record.get("status") == "Compliant"
            else "UPDATE"
        )
        audit.record_audit(
            conn, actor=_actor(principal), action=action, resource="compliance_items",
            record_id=record_id, before=before, after=record,
            changed_fields=audit.changed_keys(before, record), request=request,
        )
    return _compliance_item(record)


@router.put("/compliance/checkpoints/{record_id}")
def put_checkpoint(
    record_id: int,
    payload: ComplianceCheckpointIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:write")),
) -> dict:
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM compliance_items WHERE id = ?", (record_id,), conn=conn)
        before = require_found(before, "Checkpoint")
        values = _compliance_values(payload, principal, existing=before)
        record = db.update("compliance_items", record_id, values, conn=conn)
        record = require_found(record, "Checkpoint")
        action = (
            "APPROVAL"
            if before.get("status") != "Compliant" and record.get("status") == "Compliant"
            else "UPDATE"
        )
        audit.record_audit(
            conn, actor=_actor(principal), action=action, resource="compliance_items",
            record_id=record_id, before=before, after=record,
            changed_fields=audit.changed_keys(before, record), request=request,
        )
    return _compliance_out(record)


@router.delete("/compliance/{record_id}")
def remove_compliance(
    record_id: int,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:delete")),
) -> dict:
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM compliance_items WHERE id = ?", (record_id,), conn=conn)
        if not db.delete("compliance_items", record_id, conn=conn):
            raise HTTPException(status_code=404, detail="Item not found")
        audit.record_audit(
            conn, actor=_actor(principal), action="DELETE", resource="compliance_items",
            record_id=record_id, before=before, request=request,
        )
    return {"deleted": record_id}


@router.delete("/compliance/checkpoints/{record_id}")
def remove_checkpoint(
    record_id: int,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:delete")),
) -> dict:
    return remove_compliance(record_id, request, principal)


# ---------------------------------------------------------------------------
# Compliance consignments (canonical) + legacy disposals compatibility
# ---------------------------------------------------------------------------
@router.get("/compliance/consignments")
def list_consignments(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    source: Optional[str] = Query(default=None, max_length=10),
    limit: Optional[int] = Query(default=None, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:read")),
) -> list[dict]:
    rows = _filtered_rows("disposal_records", date_from, date_to, source, limit, offset)
    return [_consignment_out(row) for row in rows]


@router.post("/compliance/consignments", status_code=201)
def add_consignment(
    payload: ConsignmentIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:write")),
) -> dict:
    now = _utc_now()
    values = {
        "date": payload.date,
        "quantity_kg": payload.quantity_kg,
        "facility": payload.authorised_facility.strip(),
        "manifest_no": payload.manifest_number.strip(),
        "transport_mode": payload.transport_mode.strip(),
        "source": "user",
        "created_at": now,
        "updated_at": now,
        "updated_by": principal.username if principal else "anonymous",
    }
    with db.transaction() as conn:
        _ensure_unique(conn, "disposal_records", values)
        record = db.insert("disposal_records", values, conn=conn)
        audit.record_audit(
            conn, actor=_actor(principal), action="CREATE", resource="disposal_records",
            record_id=record["id"], after=record, request=request,
        )
    return _consignment_out(record)


@router.put("/compliance/consignments/{record_id}")
def put_consignment(
    record_id: int,
    payload: ConsignmentIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:write")),
) -> dict:
    values = {
        "date": payload.date,
        "quantity_kg": payload.quantity_kg,
        "facility": payload.authorised_facility.strip(),
        "manifest_no": payload.manifest_number.strip(),
        "transport_mode": payload.transport_mode.strip(),
        "updated_at": _utc_now(),
        "updated_by": principal.username if principal else "anonymous",
    }
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM disposal_records WHERE id = ?", (record_id,), conn=conn)
        before = require_found(before, "Consignment")
        _ensure_unique(conn, "disposal_records", values, record_id)
        record = db.update("disposal_records", record_id, values, conn=conn)
        record = require_found(record, "Consignment")
        audit.record_audit(
            conn, actor=_actor(principal), action="UPDATE", resource="disposal_records",
            record_id=record_id, before=before, after=record,
            changed_fields=audit.changed_keys(before, record), request=request,
        )
    return _consignment_out(record)


@router.delete("/compliance/consignments/{record_id}")
def remove_consignment(
    record_id: int,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("disposal:delete")),
) -> dict:
    with db.transaction() as conn:
        before = db.fetch_one("SELECT * FROM disposal_records WHERE id = ?", (record_id,), conn=conn)
        if not db.delete("disposal_records", record_id, conn=conn):
            raise HTTPException(status_code=404, detail="Consignment not found")
        audit.record_audit(
            conn, actor=_actor(principal), action="DELETE", resource="disposal_records",
            record_id=record_id, before=before, request=request,
        )
    return {"deleted": record_id}


# ---------------------------------------------------------------------------
# Module 05 — technology selection settings
# ---------------------------------------------------------------------------
def technology_settings(conn=None) -> dict:
    row = db.fetch_one("SELECT * FROM technology_settings WHERE id = 1", conn=conn)
    if row is None:
        sample = json.loads(db.SAMPLE_PATH.read_text(encoding="utf-8"))["technology"]
        return {**sample, "updated_at": None}
    return {
        "weights": json.loads(row["weights"]),
        "scores": json.loads(row["scores"]),
        "updated_at": row["updated_at"],
    }


@router.get("/technology")
def get_technology(
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("technology:read")),
) -> dict:
    return technology_settings()


@router.put("/technology")
def save_technology(
    payload: TechnologySettingsIn,
    request: Request,
    principal: Optional[auth.Principal] = Depends(auth.require_permission("technology:write")),
) -> dict:
    now = _utc_now()
    weights = json.dumps(payload.weights)
    scores = json.dumps(payload.scores)
    with db.transaction() as conn:
        row = db.fetch_one("SELECT * FROM technology_settings WHERE id = 1", conn=conn)
        before = (
            {"weights": json.loads(row["weights"]), "scores": json.loads(row["scores"]), "updated_at": row["updated_at"]}
            if row else technology_settings()
        )
        conn.execute(
            """INSERT INTO technology_settings (id, weights, scores, updated_at)
               VALUES (1, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET weights=excluded.weights,
               scores=excluded.scores, updated_at=excluded.updated_at""",
            (weights, scores, now),
        )
        after = {"weights": payload.weights, "scores": payload.scores, "updated_at": now}
        audit.record_audit(
            conn, actor=_actor(principal), action="UPDATE", resource="technology_settings",
            record_id=1, before=before, after=after,
            changed_fields=audit.changed_keys(before, after), request=request,
        )
    return after


@router.get("/compliance/reconciliation")
def compliance_reconciliation(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    opening_stock_kg: Optional[float] = Query(default=None),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("compliance:read")),
) -> dict:
    if date_from:
        try: valid_date(date_from)
        except ValueError as exc: raise HTTPException(status_code=400, detail="date_from must be YYYY-MM-DD") from exc
    if date_to:
        try: valid_date(date_to)
        except ValueError as exc: raise HTTPException(status_code=400, detail="date_to must be YYYY-MM-DD") from exc
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be before or equal to date_to")
    if opening_stock_kg is not None and (not isinstance(opening_stock_kg, (int,float)) or opening_stock_kg != opening_stock_kg or opening_stock_kg < 0):
        raise HTTPException(status_code=400, detail="opening_stock_kg must be >= 0")

    clauses=[]; params={}
    if date_from: clauses.append("date >= :date_from"); params["date_from"]=date_from
    if date_to: clauses.append("date <= :date_to"); params["date_to"]=date_to
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with db.transaction() as conn:
        gen = db.fetch_all(f"SELECT id, date, wet_sludge_kg FROM generation_records{where} ORDER BY date, id", params, conn=conn)
        disp = db.fetch_all(f"SELECT id, date, quantity_kg FROM disposal_records{where} ORDER BY date, id", params, conn=conn)
    generated = sum(float(r.get("wet_sludge_kg") or 0) for r in gen)
    disposed = sum(float(r.get("quantity_kg") or 0) for r in disp)
    missing = []
    if opening_stock_kg is None:
        missing.append("Opening stock data required.")
    if not gen:
        missing.append("No sludge generation records in selected period.")
    if not disp:
        missing.append("No disposal consignment records in selected period.")
    closing = None if opening_stock_kg is None else opening_stock_kg + generated - disposed
    difference = None if closing is None else closing
    return {
        "period": {"date_from": date_from, "date_to": date_to},
        "opening_stock_kg": opening_stock_kg,
        "sludge_generated_kg": generated,
        "sludge_disposed_kg": disposed,
        "closing_stock_kg": closing,
        "difference_kg": difference,
        "negative_closing_stock": closing is not None and closing < 0,
        "missing_data": missing,
        "generation_record_count": len(gen),
        "disposal_record_count": len(disp),
        "calculated": True,
        "formula": "Closing Stock = Opening Stock + Sludge Generated - Sludge Disposed",
        "disclaimer": "Quantity reconciliation is an operational estimate. It does not establish regulatory compliance.",
    }


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Dashboard / report data aggregation
# ---------------------------------------------------------------------------
def _validate_report_filters(date_from: Optional[str], date_to: Optional[str], report_type: str) -> str:
    if date_from:
        try: valid_date(date_from)
        except ValueError as exc: raise HTTPException(status_code=400, detail="date_from must be YYYY-MM-DD") from exc
    if date_to:
        try: valid_date(date_to)
        except ValueError as exc: raise HTTPException(status_code=400, detail="date_to must be YYYY-MM-DD") from exc
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be before or equal to date_to")
    rt = (report_type or "full").lower()
    allowed = {"full","generation","characterisation","handling","technology","compliance","disposal"}
    if rt not in allowed:
        raise HTTPException(status_code=400, detail="Invalid report_type")
    return rt


@router.get("/reports/data")
def report_data(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    report_type: str = Query(default="full", max_length=32),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("reports:read")),
) -> dict:
    rt = _validate_report_filters(date_from, date_to, report_type)
    from . import reporting
    with db.transaction() as conn:
        snap = reporting.snapshot(conn, date_from=date_from, date_to=date_to, report_type=rt)
    # backward-compatible top-level keys
    snap.setdefault("disposal", snap.get("disposals", []))
    return snap


@router.get("/reports/export/csv")
def export_report_csv(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    report_type: str = Query(default="full", max_length=32),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("reports:read")),
):
    rt = _validate_report_filters(date_from, date_to, report_type)
    from . import reporting
    from fastapi.responses import Response
    with db.transaction() as conn:
        snap = reporting.snapshot(conn, date_from=date_from, date_to=date_to, report_type=rt)
    content = reporting.build_csv(snap)
    name = f"sludge-smart-{rt}-report.csv"
    return Response(content=content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/reports/export/pdf")
def export_report_pdf(
    request: Request,
    date_from: Optional[str] = Query(default=None, max_length=10),
    date_to: Optional[str] = Query(default=None, max_length=10),
    report_type: str = Query(default="full", max_length=32),
    principal: Optional[auth.Principal] = Depends(auth.require_permission("reports:read")),
):
    rt = _validate_report_filters(date_from, date_to, report_type)
    from . import reporting
    from fastapi.responses import Response
    with db.transaction() as conn:
        snap = reporting.snapshot(conn, date_from=date_from, date_to=date_to, report_type=rt)
    content = reporting.build_pdf(snap)
    name = f"sludge-smart-{rt}-report.pdf"
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})
