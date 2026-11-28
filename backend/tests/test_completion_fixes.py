from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import auth, config, db
from app.main import unhandled_exception_handler
from app.schemas import valid_date
from conftest import make_user, token_for


def test_flagged_password_user_reaches_business_api(client):
    make_user("tester", "StrongPassword123!", ("administrator",))
    with db.transaction() as conn:
        conn.execute("UPDATE users SET must_change_password = 1 WHERE username = ?", ("tester",))
    headers = {"Authorization": f"Bearer {token_for(client, 'tester', 'StrongPassword123!')}"}
    response = client.get("/api/generation", headers=headers)
    assert response.status_code == 200
    assert "X-Password-Change-Required" not in response.headers
    assert client.get("/api/auth/me", headers=headers).json()["must_change_password"] is True


def test_frontend_direct_dashboard_and_optional_password_change_route():
    root = Path(__file__).resolve().parents[2]
    auth_gate = (root / "src/components/AuthGate.jsx").read_text()
    login = (root / "src/pages/Login.jsx").read_text()
    app = (root / "src/App.jsx").read_text()
    api = (root / "src/lib/api.js").read_text()
    assert "must_change_password" not in auth_gate
    assert "PasswordChange" not in auth_gate
    assert "navigate('/', { replace: true })" in login
    assert 'path="/change-password"' in app
    assert "markPasswordChangeRequired" not in api


def test_audit_filters_validate_timestamps_and_shadow_denials(client):
    make_user("rootadm", "StrongPassword123!", ("administrator",))
    make_user("labuser", "StrongPassword123!", ("laboratory",))
    admin = {"Authorization": f"Bearer {token_for(client, 'rootadm', 'StrongPassword123!')}"}
    lab = {"Authorization": f"Bearer {token_for(client, 'labuser', 'StrongPassword123!')}"}

    assert client.get("/api/audit?from_ts=not-a-date", headers=admin).status_code == 400
    assert client.get("/api/audit?to_ts=2026-13-01", headers=admin).status_code == 400
    assert client.get("/api/audit?from_ts=2026-12-01&to_ts=2026-11-01", headers=admin).status_code == 400

    denied = client.post(
        "/api/generation",
        json={"date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
              "moisture_pct": 90, "operating_days": 1},
        headers=lab,
    )
    assert denied.status_code == 201
    audit_rows = client.get("/api/audit?resource=generation:write", headers=admin)
    assert audit_rows.status_code == 200
    assert audit_rows.json()["total"] >= 1


def test_update_endpoints_filters_and_timestamps(client):
    generation = client.post(
        "/api/generation",
        json={"date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
              "moisture_pct": 90, "operating_days": 1},
    ).json()
    lab = client.post(
        "/api/characterisation",
        json={"date": "2026-11-27", "sample_id": "LAB-COMP-1", "ph": 7.1},
    ).json()
    handling = client.post(
        "/api/handling",
        json={"date": "2026-11-27", "process_group": "Thickening",
              "technology": "Gravity thickener", "initial_mass_kg": 100,
              "initial_moisture_pct": 94, "final_moisture_pct": 90},
    ).json()
    disposal = client.post(
        "/api/disposals",
        json={"date": "2026-11-27", "quantity_kg": 25, "facility": "Authorised Facility",
              "manifest_no": "MFT-COMP-1", "transport_mode": "Covered truck"},
    ).json()

    updates = (
        ("/api/generation", generation, {"date": "2026-11-28", "wastewater_m3": 12,
                                           "wet_sludge_kg": 24, "moisture_pct": 89,
                                           "operating_days": 26}),
        ("/api/characterisation", lab, {"date": "2026-11-28", "sample_id": "LAB-COMP-2", "ph": 7.4}),
        ("/api/handling", handling, {"date": "2026-11-28", "process_group": "Thickening",
                                      "technology": "Gravity thickener", "initial_mass_kg": 120,
                                      "initial_moisture_pct": 94, "final_moisture_pct": 88}),
        ("/api/disposals", disposal, {"date": "2026-11-28", "quantity_kg": 30,
                                       "facility": "Authorised Facility",
                                       "manifest_no": "MFT-COMP-2", "transport_mode": "Covered truck"}),
    )
    for path, created, payload in updates:
        response = client.patch(f"{path}/{created['id']}", json=payload)
        assert response.status_code == 200, response.text
        updated = response.json()
        assert updated["id"] == created["id"]
        assert updated["date"] == "2026-11-28"
        assert updated["created_at"] == created["created_at"]

    assert client.patch("/api/generation/999999", json=updates[0][2]).status_code == 404
    assert client.get("/api/generation?date_from=bad").status_code == 400
    assert client.get("/api/generation?source=unknown").status_code == 400

    filtered = client.get(
        "/api/generation?date_from=2026-11-28&date_to=2026-11-28&source=user&limit=1"
    )
    assert filtered.status_code == 200
    assert len(filtered.json()) == 1
    assert filtered.json()[0]["date"] == "2026-11-28"


def test_validation_rejects_invalid_settings_and_due_dates(client):
    invalid_weights = client.put(
        "/api/technology", json={"weights": {"cost": 10}, "scores": {"a": {"cost": 6}}}
    )
    assert invalid_weights.status_code == 422
    invalid_due = client.post(
        "/api/compliance",
        json={"area": "Storage", "requirement": "Test", "due_date": "not-a-date"},
    )
    assert invalid_due.status_code == 422


def test_date_validation_is_strict_iso():
    assert valid_date("2026-11-27") == "2026-11-27"
    for value in ("20261127", "2026-W48-5", "27-11-2026", "2026-2-3"):
        try:
            valid_date(value)
        except ValueError:
            continue
        raise AssertionError(f"{value} should not be accepted")


def test_compliance_patch_supports_full_edits_and_clearing_due_date(client):
    created = client.post(
        "/api/compliance",
        json={"area": "Storage", "requirement": "Record storage", "due_date": "2026-12-01"},
    ).json()
    response = client.patch(
        f"/api/compliance/{created['id']}",
        json={"area": "Storage review", "requirement": "Review storage evidence", "detail": "Checked", "due_date": None},
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["area"] == "Storage review"
    assert updated["requirement"] == "Review storage evidence"
    assert updated["detail"] == "Checked"
    assert updated["due_date"] is None


def test_rate_limit_state_is_pruned(monkeypatch):
    monkeypatch.setattr(config, "LOCKOUT_SECONDS", 1)
    auth._FAILED.clear()
    auth._FAILED[("ip", "old")] = (config.MAX_FAILED_ATTEMPTS, 0)
    assert auth.login_allowed("ip", "old") is True
    assert ("ip", "old") not in auth._FAILED


def test_partial_patch_preserves_omitted_fields(client):
    generation = client.post(
        "/api/generation",
        json={"date": "2026-11-20", "wastewater_m3": 40, "wet_sludge_kg": 80,
              "moisture_pct": 92, "operating_days": 20},
    ).json()
    lab = client.post(
        "/api/characterisation",
        json={"date": "2026-11-20", "sample_id": "LAB-PARTIAL-1", "ph": 7.2,
              "lead_mgkg": 3.5, "other_contaminants": "none"},
    ).json()
    disposal = client.post(
        "/api/disposals",
        json={"date": "2026-11-20", "quantity_kg": 100, "facility": "Facility A",
              "manifest_no": "MFT-PARTIAL-1", "transport_mode": "Tank"},
    ).json()

    generation_patch = client.patch(
        f"/api/generation/{generation['id']}", json={"moisture_pct": 90}
    )
    assert generation_patch.status_code == 200, generation_patch.text
    updated_generation = generation_patch.json()
    assert updated_generation["moisture_pct"] == 90
    assert updated_generation["wastewater_m3"] == 40
    assert updated_generation["wet_sludge_kg"] == 80
    assert updated_generation["operating_days"] == 20
    assert updated_generation["date"] == "2026-11-20"

    lab_patch = client.patch(f"/api/characterisation/{lab['id']}", json={"ph": 7.6})
    assert lab_patch.status_code == 200, lab_patch.text
    updated_lab = lab_patch.json()
    assert updated_lab["ph"] == 7.6
    assert updated_lab["sample_id"] == "LAB-PARTIAL-1"
    assert updated_lab["date"] == "2026-11-20"
    assert updated_lab["lead_mgkg"] == 3.5
    assert updated_lab["other_contaminants"] == "none"

    disposal_patch = client.patch(
        f"/api/disposals/{disposal['id']}", json={"quantity_kg": 120}
    )
    assert disposal_patch.status_code == 200, disposal_patch.text
    updated_disposal = disposal_patch.json()
    assert updated_disposal["quantity_kg"] == 120
    assert updated_disposal["manifest_no"] == "MFT-PARTIAL-1"
    assert updated_disposal["facility"] == "Facility A"


def test_duplicate_sample_id_and_manifest_return_conflict(client):
    first_lab = client.post(
        "/api/characterisation",
        json={"date": "2026-11-21", "sample_id": "LAB-DUP-1", "ph": 7},
    )
    assert first_lab.status_code == 201
    duplicate_lab = client.post(
        "/api/characterisation",
        json={"date": "2026-11-21", "sample_id": "LAB-DUP-1", "ph": 7},
    )
    assert duplicate_lab.status_code == 409

    first_disposal = client.post(
        "/api/disposals",
        json={"date": "2026-11-21", "quantity_kg": 10, "facility": "Facility B",
              "manifest_no": "MFT-DUP-1"},
    )
    assert first_disposal.status_code == 201
    duplicate_disposal = client.post(
        "/api/disposals",
        json={"date": "2026-11-21", "quantity_kg": 10, "facility": "Facility B",
              "manifest_no": "MFT-DUP-1"},
    )
    assert duplicate_disposal.status_code == 409

    other_lab = client.post(
        "/api/characterisation",
        json={"date": "2026-11-21", "sample_id": "LAB-DUP-2", "ph": 7},
    ).json()
    patch_to_duplicate = client.patch(
        f"/api/characterisation/{other_lab['id']}", json={"sample_id": "LAB-DUP-1"}
    )
    assert patch_to_duplicate.status_code == 409


def test_health_checks_database(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"


def test_enforcement_denials_are_audited(client, monkeypatch):
    make_user("rootaudit", "StrongPassword123!", ("administrator",))
    admin = {"Authorization": f"Bearer {token_for(client, 'rootaudit', 'StrongPassword123!')}"}
    monkeypatch.setattr(config, "AUTH_ENFORCEMENT", True)

    denied = client.post(
        "/api/generation",
        json={"date": "2026-11-22", "wastewater_m3": 1, "wet_sludge_kg": 2,
              "moisture_pct": 90, "operating_days": 1},
    )
    assert denied.status_code == 401

    rows = client.get("/api/audit?action=PERMISSION_DENIED", headers=admin)
    assert rows.status_code == 200, rows.text
    assert rows.json()["total"] >= 1
    assert rows.json()["items"][0]["outcome"] == "failure"


def test_db_path_and_trusted_origins_are_safe(monkeypatch):
    monkeypatch.setenv("SLUDGE_SMART_DB_PATH", "data/custom.db")
    assert config._db_path().is_absolute()
    assert config._db_path().name == "custom.db"
    assert "*" not in config.TRUSTED_ORIGINS
    assert config.TRUSTED_ORIGINS


def test_unhandled_exception_handler_is_sanitized():
    probe = FastAPI()

    @probe.get("/boom")
    def boom():
        raise RuntimeError("database password must never leak")

    probe.add_exception_handler(Exception, unhandled_exception_handler)
    with TestClient(probe, raise_server_exceptions=False) as test_client:
        response = test_client.get("/boom")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "request_id": None}
    assert "password" not in response.text


def test_isolated_end_to_end_workflow(client):
    make_user("e2eadmin", "StrongPassword123!", ("administrator",))
    headers = {"Authorization": f"Bearer {token_for(client, 'e2eadmin', 'StrongPassword123!')}"}

    generation = client.post(
        "/api/generation",
        json={"date": "2026-11-25", "wastewater_m3": 100, "wet_sludge_kg": 200,
              "moisture_pct": 94, "operating_days": 10},
        headers=headers,
    )
    lab = client.post(
        "/api/characterisation",
        json={"date": "2026-11-25", "sample_id": "LAB-E2E-1", "ph": 7.1},
        headers=headers,
    )
    handling = client.post(
        "/api/handling",
        json={"date": "2026-11-25", "process_group": "Drying", "technology": "Solar drying",
              "initial_mass_kg": 200, "initial_moisture_pct": 94, "final_moisture_pct": 70},
        headers=headers,
    )
    disposal = client.post(
        "/api/disposals",
        json={"date": "2026-11-25", "quantity_kg": 50, "facility": "E2E Facility",
              "manifest_no": "MFT-E2E-1", "transport_mode": "Covered truck"},
        headers=headers,
    )
    compliance = client.post(
        "/api/compliance",
        json={"area": "Storage", "requirement": "E2E evidence", "detail": "Initial"},
        headers=headers,
    )
    for response in (generation, lab, handling, disposal, compliance):
        assert response.status_code in (200, 201), response.text

    gen_id = generation.json()["id"]
    lab_id = lab.json()["id"]
    handling_id = handling.json()["id"]
    disposal_id = disposal.json()["id"]
    compliance_id = compliance.json()["id"]

    assert client.patch(
        f"/api/generation/{gen_id}", json={"moisture_pct": 92}, headers=headers
    ).json()["wet_sludge_kg"] == 200
    assert client.patch(
        f"/api/characterisation/{lab_id}", json={"ph": 7.4}, headers=headers
    ).json()["sample_id"] == "LAB-E2E-1"
    assert client.patch(
        f"/api/handling/{handling_id}", json={"final_moisture_pct": 68}, headers=headers
    ).json()["initial_mass_kg"] == 200
    assert client.patch(
        f"/api/disposals/{disposal_id}", json={"quantity_kg": 55}, headers=headers
    ).json()["manifest_no"] == "MFT-E2E-1"
    compliance_patch = client.patch(
        f"/api/compliance/{compliance_id}", json={"status": "Compliant", "note": "Reviewed"}, headers=headers
    )
    assert compliance_patch.status_code == 200, compliance_patch.text
    assert compliance_patch.json()["note"] == "Reviewed"

    snapshot = client.get("/api/reports/data", headers=headers)
    assert snapshot.status_code == 200, snapshot.text
    payload = snapshot.json()
    assert any(row["id"] == gen_id and row["moisture_pct"] == 92 for row in payload["generation"])
    assert any(row["id"] == lab_id and row["ph"] == 7.4 for row in payload["characterisation"])
    assert any(row["id"] == handling_id and row["final_moisture_pct"] == 68 for row in payload["handling"])
    assert any(row["id"] == disposal_id and row["quantity_kg"] == 55 for row in payload["disposals"])
    assert any(row["id"] == compliance_id and row["note"] == "Reviewed" for row in payload["compliance"])

    audit_rows = client.get("/api/audit?action=CREATE", headers=headers)
    assert audit_rows.status_code == 200, audit_rows.text
    assert audit_rows.json()["total"] >= 5

    removed = client.delete(f"/api/disposals/{disposal_id}", headers=headers)
    assert removed.status_code == 200, removed.text
    remaining = client.get("/api/disposals", headers=headers)
    assert all(row["id"] != disposal_id for row in remaining.json())
