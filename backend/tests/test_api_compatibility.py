import pytest

from app import audit, config, db

GENERATION_KEYS = {"id", "date", "wastewater_m3", "wet_sludge_kg", "moisture_pct",
                   "operating_days", "source", "created_at"}
LAB_KEYS = {"id", "date", "sample_id", "ph", "moisture_pct", "total_solids_pct",
            "volatile_solids_pct", "oil_grease_mgkg", "cod_mgl", "lead_mgkg",
            "chromium_mgkg", "cadmium_mgkg", "nickel_mgkg", "other_contaminants",
            "source", "created_at"}
HANDLING_KEYS = {"id", "date", "process_group", "technology", "initial_mass_kg",
                 "initial_moisture_pct", "final_moisture_pct", "source", "created_at"}
DISPOSAL_KEYS = {"id", "date", "quantity_kg", "facility", "manifest_no",
                 "transport_mode", "source", "created_at"}
COMPLIANCE_KEYS = {"id", "area", "requirement", "detail", "status", "due_date",
                   "note", "updated_at"}


def test_all_twenty_legacy_endpoints_keep_their_response_shapes(client):
    health = client.get("/api/health")
    assert health.status_code == 200 and set(health.json()) == {"status", "database"}
    assert health.json()["status"] == "ok"
    assert "/data/" not in health.json()["database"]

    generation = client.get("/api/generation")
    assert generation.status_code == 200 and set(generation.json()[0]) == GENERATION_KEYS
    created = client.post("/api/generation", json={
        "date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
        "moisture_pct": 90, "operating_days": 1,
    })
    assert created.status_code == 201 and set(created.json()) == GENERATION_KEYS
    assert created.json()["source"] == "user"
    assert client.delete(f"/api/generation/{created.json()['id']}").json() == {
        "deleted": created.json()["id"]
    }
    assert client.delete("/api/generation/999999").json() == {"detail": "Record not found"}

    lab = client.get("/api/characterisation")
    assert lab.status_code == 200 and set(lab.json()[0]) == LAB_KEYS
    lab_created = client.post("/api/characterisation", json={
        "date": "2026-11-27", "sample_id": "COMPAT-1", "ph": 7.1,
    })
    assert lab_created.status_code == 201 and set(lab_created.json()) == LAB_KEYS
    assert client.delete(f"/api/characterisation/{lab_created.json()['id']}").status_code == 200

    handling = client.get("/api/handling")
    assert handling.status_code == 200 and set(handling.json()[0]) == HANDLING_KEYS
    handling_created = client.post("/api/handling", json={
        "date": "2026-11-27", "process_group": "Dewatering", "technology": "Filter press",
        "initial_mass_kg": 1000, "initial_moisture_pct": 91, "final_moisture_pct": 70,
    })
    assert handling_created.status_code == 201 and set(handling_created.json()) == HANDLING_KEYS
    assert client.delete(f"/api/handling/{handling_created.json()['id']}").status_code == 200

    disposals = client.get("/api/disposals")
    assert disposals.status_code == 200 and DISPOSAL_KEYS.issubset(disposals.json()[0])
    disposal_created = client.post("/api/disposals", json={
        "date": "2026-11-27", "quantity_kg": 1000, "facility": "TSDF", "manifest_no": "M-1",
    })
    assert disposal_created.status_code == 201 and DISPOSAL_KEYS.issubset(disposal_created.json())
    assert client.delete(f"/api/disposals/{disposal_created.json()['id']}").status_code == 200

    compliance = client.get("/api/compliance")
    assert compliance.status_code == 200 and COMPLIANCE_KEYS.issubset(compliance.json()[0])
    compliance_created = client.post("/api/compliance", json={
        "area": "Test", "requirement": "Verify response shape",
    })
    assert compliance_created.status_code == 201 and COMPLIANCE_KEYS.issubset(compliance_created.json())
    patched = client.patch(f"/api/compliance/{compliance_created.json()['id']}", json={"status": "Compliant"})
    assert patched.status_code == 200 and COMPLIANCE_KEYS.issubset(patched.json())
    assert client.patch(f"/api/compliance/{compliance_created.json()['id']}", json={}).status_code == 400
    assert client.delete(f"/api/compliance/{compliance_created.json()['id']}").status_code == 200

    technology = client.get("/api/technology")
    assert technology.status_code == 200 and set(technology.json()) == {"weights", "scores", "updated_at"}
    saved = client.put("/api/technology", json={
        "weights": technology.json()["weights"], "scores": technology.json()["scores"],
    })
    assert saved.status_code == 200 and set(saved.json()) == {"weights", "scores", "updated_at"}

    report = client.get("/api/reports/data")
    assert report.status_code == 200
    assert set(report.json()) == {
        "generation", "characterisation", "handling", "disposals",
        "compliance", "technology", "generated_at",
    }

    invalid = client.post("/api/generation", json={"date": "not-a-date", "wastewater_m3": -1})
    assert invalid.status_code == 422


def test_correlation_header_is_returned(client):
    response = client.get("/api/generation", headers={"X-Request-ID": "trace-abc"})
    assert response.headers["X-Request-ID"] == "trace-abc"
    assert client.get("/api/generation").headers["X-Request-ID"]


def test_cors_uses_trusted_origins_not_wildcard(client):
    from app.main import app
    middleware = [m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware"]
    assert middleware
    options = getattr(middleware[0], "kwargs", None) or getattr(middleware[0], "options", {})
    assert "*" not in options["allow_origins"]
    assert set(options["allow_origins"]) <= set(config.TRUSTED_ORIGINS)
    assert options["allow_credentials"] is False
    assert "DELETE" in options["allow_methods"]


def test_database_identifier_allowlist_and_select_only_reads(client):
    with pytest.raises(ValueError):
        db.validate_table("users; DROP TABLE users")
    with pytest.raises(ValueError):
        db.validate_columns(["id", "bad name"])
    with pytest.raises(ValueError):
        db.fetch_all("DELETE FROM users")
    assert db.fetch_one("SELECT COUNT(*) AS n FROM users")["n"] == 0
