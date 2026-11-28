from datetime import date, timedelta

from app import db
from conftest import make_user, token_for


def auth_header(client, username, password, roles):
    make_user(username, password, roles)
    token = token_for(client, username, password)
    return {"Authorization": f"Bearer {token}"}


def test_checkpoint_crud_persists(client):
    payload = {
        "area": "Storage",
        "requirement": "Covered storage",
        "current_evidence": "Photo log",
        "status": "Action required",
        "due_date": "2026-12-01",
        "note": "Initial",
    }
    created = client.post("/api/compliance/checkpoints", json=payload)
    assert created.status_code == 201
    body = created.json()
    assert body["current_evidence"] == "Photo log"
    assert body["status"] == "Action required"

    listed = client.get("/api/compliance/checkpoints")
    assert any(row["id"] == body["id"] for row in listed.json())

    updated = client.put(f"/api/compliance/checkpoints/{body['id']}", json={**payload, "status": "Compliant", "note": "Reviewed"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "Compliant"
    assert updated.json()["note"] == "Reviewed"

    deleted = client.delete(f"/api/compliance/checkpoints/{body['id']}")
    assert deleted.status_code == 200
    assert all(row["id"] != body["id"] for row in client.get("/api/compliance/checkpoints").json())


def test_checkpoint_summary_and_overdue(client):
    today = date.today()
    client.post("/api/compliance/checkpoints", json={"area":"A","requirement":"R1","status":"Compliant","due_date":(today+timedelta(days=1)).isoformat(),"current_evidence":"","note":""})
    client.post("/api/compliance/checkpoints", json={"area":"B","requirement":"R2","status":"Action required","due_date":(today-timedelta(days=1)).isoformat(),"current_evidence":"","note":""})
    client.post("/api/compliance/checkpoints", json={"area":"C","requirement":"R3","status":"Information missing","due_date":(today-timedelta(days=2)).isoformat(),"current_evidence":"","note":""})
    rows = client.get("/api/compliance/checkpoints").json()
    counts = {
        "total": len(rows),
        "Compliant": sum(1 for r in rows if r["status"] == "Compliant"),
        "Action required": sum(1 for r in rows if r["status"] == "Action required"),
        "Information missing": sum(1 for r in rows if r["status"] == "Information missing"),
        "overdue": sum(1 for r in rows if r["due_date"] and r["status"] != "Compliant" and r["due_date"] < today.isoformat()),
    }
    assert counts["Compliant"] >= 1
    assert counts["Action required"] >= 1
    assert counts["Information missing"] >= 1
    assert counts["overdue"] >= 2


def test_consignment_crud_and_duplicate_manifest(client):
    payload = {
        "date": "2026-11-27",
        "quantity_kg": 1234,
        "authorised_facility": "TSDF",
        "manifest_number": "MFT-NEW-1",
        "transport_mode": "Covered truck",
    }
    created = client.post("/api/compliance/consignments", json=payload)
    assert created.status_code == 201
    cid = created.json()["id"]

    dup = client.post("/api/compliance/consignments", json={**payload, "manifest_number": "MFT-NEW-1"})
    assert dup.status_code == 409

    updated = client.put(f"/api/compliance/consignments/{cid}", json={**payload, "quantity_kg": 1500})
    assert updated.status_code == 200
    assert updated.json()["quantity_kg"] == 1500

    listed = client.get("/api/compliance/consignments?date_from=2026-11-27&date_to=2026-11-27")
    assert any(r["id"] == cid for r in listed.json())

    deleted = client.delete(f"/api/compliance/consignments/{cid}")
    assert deleted.status_code == 200


def test_reconciliation_uses_generation_and_disposals(client):
    client.post("/api/generation", json={"date":"2026-11-01","wastewater_m3":100,"wet_sludge_kg":2000,"moisture_pct":90,"operating_days":10})
    client.post("/api/compliance/consignments", json={"date":"2026-11-02","quantity_kg":500,"authorised_facility":"TSDF","manifest_number":"MFT-R-1","transport_mode":"Truck"})
    res = client.get("/api/compliance/reconciliation?date_from=2026-11-01&date_to=2026-11-30&opening_stock_kg=100")
    assert res.status_code == 200
    body = res.json()
    assert body["sludge_generated_kg"] >= 2000
    assert body["sludge_disposed_kg"] >= 500
    assert body["closing_stock_kg"] == body["opening_stock_kg"] + body["sludge_generated_kg"] - body["sludge_disposed_kg"]


def test_reconciliation_missing_opening_stock(client):
    res = client.get("/api/compliance/reconciliation?date_from=2026-11-01&date_to=2026-11-30")
    assert res.status_code == 200
    body = res.json()
    assert body["opening_stock_kg"] is None
    assert any("Opening stock data required" in m for m in body["missing_data"])


def test_checkpoint_rbac_and_auth(client, monkeypatch):
    monkeypatch.setattr("app.config.AUTH_ENFORCEMENT", True)
    # anonymous blocked
    assert client.get("/api/compliance/checkpoints").status_code == 401
    # operator can read but not write/delete compliance in default matrix? operator has compliance:read only
    op = auth_header(client, "op1", "StrongPassword123!", ("operator",))
    assert client.get("/api/compliance/checkpoints", headers=op).status_code == 200
    create = client.post("/api/compliance/checkpoints", json={"area":"A","requirement":"R","status":"Information missing","current_evidence":"","note":""}, headers=op)
    assert create.status_code == 403
    admin = auth_header(client, "adm1", "StrongPassword123!", ("administrator",))
    created = client.post("/api/compliance/checkpoints", json={"area":"A","requirement":"R","status":"Information missing","current_evidence":"","note":""}, headers=admin)
    assert created.status_code == 201
