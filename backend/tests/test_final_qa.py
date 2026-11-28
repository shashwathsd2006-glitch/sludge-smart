from secrets import token_urlsafe

from fastapi.testclient import TestClient

from app import auth, config, db
from app.main import app
from conftest import make_user, token_for


def headers_for(token):
    return {"Authorization": f"Bearer {token}"}


def test_enforcement_mode_blocks_unauthorized_and_preserves_writes(client, monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENFORCEMENT", True)
    passwords = {role: token_urlsafe(24) for role in ("administrator", "operator", "laboratory", "ehs_reviewer")}
    for role, password in passwords.items():
        make_user(f"qa_{role}", password, (role,))
    tokens = {role: token_for(client, f"qa_{role}", password) for role, password in passwords.items()}
    headers = {role: headers_for(token) for role, token in tokens.items()}

    assert client.get("/api/generation").status_code == 401

    generation = client.post(
        "/api/generation",
        json={"date": "2026-11-29", "wastewater_m3": 100, "wet_sludge_kg": 200,
              "moisture_pct": 94, "operating_days": 26},
        headers=headers["operator"],
    )
    assert generation.status_code == 201, generation.text
    assert client.post(
        "/api/characterisation",
        json={"date": "2026-11-29", "sample_id": "QA-OPS-1", "ph": 7.2},
        headers=headers["operator"],
    ).status_code == 403

    lab = client.post(
        "/api/characterisation",
        json={"date": "2026-11-29", "sample_id": "QA-LAB-1", "ph": 7.1},
        headers=headers["laboratory"],
    )
    assert lab.status_code == 201, lab.text
    assert client.post(
        "/api/generation",
        json={"date": "2026-11-29", "wastewater_m3": 100, "wet_sludge_kg": 200,
              "moisture_pct": 94, "operating_days": 26},
        headers=headers["laboratory"],
    ).status_code == 403

    compliance = client.post(
        "/api/compliance",
        json={"area": "Transport", "requirement": "Maintain manifests"},
        headers=headers["ehs_reviewer"],
    )
    assert compliance.status_code == 201, compliance.text
    assert client.delete(f"/api/compliance/{compliance.json()['id']}", headers=headers["ehs_reviewer"]).status_code == 403

    assert client.get("/api/audit", headers=headers["administrator"]).status_code == 200
    assert client.get("/api/audit", headers=headers["operator"]).status_code == 403

    with TestClient(app) as restarted:
        rows = restarted.get("/api/generation", headers=headers["administrator"]).json()
        assert any(row["id"] == generation.json()["id"] for row in rows)
        snapshot = restarted.get("/api/reports/data", headers=headers["administrator"]).json()
        assert any(row["id"] == generation.json()["id"] for row in snapshot["generation"])

    audit = client.get("/api/audit?resource=generation_records", headers=headers["administrator"]).json()
    assert audit["total"] >= 1


def test_all_legacy_endpoints_require_authentication_when_enforced(client, monkeypatch):
    monkeypatch.setattr(config, "AUTH_ENFORCEMENT", True)
    generation = {"date": "2026-11-29", "wastewater_m3": 100, "wet_sludge_kg": 200,
                  "moisture_pct": 94, "operating_days": 26}
    cases = [
        ("get", "/api/generation", None),
        ("post", "/api/generation", generation),
        ("patch", "/api/generation/1", generation),
        ("delete", "/api/generation/1", None),
        ("get", "/api/characterisation", None),
        ("post", "/api/characterisation", {"date": "2026-11-29", "sample_id": "QA-ALL-1"}),
        ("patch", "/api/characterisation/1", {"date": "2026-11-29", "sample_id": "QA-ALL-1"}),
        ("delete", "/api/characterisation/1", None),
        ("get", "/api/handling", None),
        ("post", "/api/handling", {"date": "2026-11-29", "process_group": "Thickening",
                                   "technology": "Gravity thickener", "initial_mass_kg": 100,
                                   "initial_moisture_pct": 94, "final_moisture_pct": 90}),
        ("patch", "/api/handling/1", {"date": "2026-11-29", "process_group": "Thickening",
                                      "technology": "Gravity thickener", "initial_mass_kg": 100,
                                      "initial_moisture_pct": 94, "final_moisture_pct": 90}),
        ("delete", "/api/handling/1", None),
        ("get", "/api/disposals", None),
        ("post", "/api/disposals", {"date": "2026-11-29", "quantity_kg": 100,
                                    "facility": "Facility", "manifest_no": "QA-ALL-1"}),
        ("patch", "/api/disposals/1", {"date": "2026-11-29", "quantity_kg": 100,
                                       "facility": "Facility", "manifest_no": "QA-ALL-1"}),
        ("delete", "/api/disposals/1", None),
        ("get", "/api/compliance", None),
        ("post", "/api/compliance", {"area": "Storage", "requirement": "Track evidence"}),
        ("patch", "/api/compliance/1", {"status": "Compliant"}),
        ("delete", "/api/compliance/1", None),
        ("get", "/api/technology", None),
        ("put", "/api/technology", {"weights": {}, "scores": {}}),
        ("get", "/api/reports/data", None),
    ]
    for method, path, payload in cases:
        response = getattr(client, method)(path, json=payload) if payload is not None else getattr(client, method)(path)
        assert response.status_code == 401, f"{method.upper()} {path}: {response.status_code}"


def test_invalid_expired_and_revoked_sessions_are_rejected(client):
    password = token_urlsafe(24)
    make_user("qa_session_user", password, ("administrator",))
    token = token_for(client, "qa_session_user", password)

    assert client.get("/api/auth/me", headers=headers_for(token)).status_code == 200
    assert client.get("/api/auth/me", headers=headers_for("invalid-token")).status_code == 401

    with db.transaction() as conn:
        conn.execute(
            "UPDATE user_sessions SET expires_at = ? WHERE token_hash = ?",
            ("2000-01-01T00:00:00+00:00", auth.token_hash(token)),
        )
    assert client.get("/api/auth/me", headers=headers_for(token)).status_code == 401

    current = token_for(client, "qa_session_user", password)
    assert client.post("/api/auth/logout", headers=headers_for(current)).status_code == 200
    assert client.get("/api/auth/me", headers=headers_for(current)).status_code == 401


def test_account_lockout_blocks_login_until_cleared(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_FAILED_ATTEMPTS", 3)
    monkeypatch.setattr(config, "LOCKOUT_SECONDS", 60)
    auth._FAILED.clear()
    password = token_urlsafe(24)
    username = make_user("qa_lockout_user", password, ("operator",))

    for _ in range(3):
        assert client.post(
            "/api/auth/login", json={"username": username, "password": token_urlsafe(24)}
        ).status_code == 401
    assert client.post("/api/auth/login", json={"username": username, "password": password}).status_code == 423

    with db.transaction() as conn:
        conn.execute("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE username = ?", (username,))
    auth._FAILED.clear()
    assert client.post("/api/auth/login", json={"username": username, "password": password}).status_code == 200
