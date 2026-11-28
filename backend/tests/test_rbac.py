from app import auth, config, db

from conftest import make_user, token_for


EXPECTED = {
    "administrator": None,
    "operator": {
        "generation:read", "generation:write", "generation:delete", "lab:read",
        "handling:read", "handling:write", "handling:delete",
        "disposal:read", "disposal:write", "disposal:delete",
        "compliance:read", "technology:read", "reports:read",
    },
    "laboratory": {
        "generation:read", "lab:read", "lab:write", "lab:delete",
        "handling:read", "disposal:read", "compliance:read",
        "technology:read", "reports:read",
    },
    "ehs_reviewer": {
        "generation:read", "lab:read", "handling:read", "disposal:read",
        "compliance:read", "compliance:write", "technology:read",
        "reports:read", "audit:read",
    },
}


def headers_for(client, username, password="StrongPassword123!"):
    return {"Authorization": f"Bearer {token_for(client, username, password)}"}


def test_role_permission_matrix_seeded(db_env):
    for role, expected in EXPECTED.items():
        row = db.fetch_one("SELECT id FROM roles WHERE name = ?", (role,))
        assert row, role
        actual = {
            item["code"]
            for item in db.fetch_all(
                """SELECT p.code FROM permissions p JOIN role_permissions rp
                   ON rp.permission_id = p.id WHERE rp.role_id = ?""",
                (row["id"],),
            )
        }
        if expected is None:
            assert len(actual) == 21
        else:
            assert actual == expected


def test_shadow_mode_allows_anonymous_legacy_requests(client):
    assert config.AUTH_ENFORCEMENT is False
    assert client.get("/api/generation").status_code == 200
    created = client.post(
        "/api/generation",
        json={"date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
              "moisture_pct": 90, "operating_days": 1},
    )
    assert created.status_code == 201
    assert created.json()["source"] == "user"


def test_enforcement_mode_blocks_anonymous_and_unprivileged_users(client, monkeypatch):
    for username, roles in (
        ("rootadm", ("administrator",)),
        ("op", ("operator",)),
        ("lab", ("laboratory",)),
        ("ehs", ("ehs_reviewer",)),
    ):
        make_user(username, "StrongPassword123!", roles)
    headers = {name: headers_for(client, name) for name in ("rootadm", "op", "lab", "ehs")}
    monkeypatch.setattr(config, "AUTH_ENFORCEMENT", True)

    assert client.get("/api/generation").status_code == 401
    assert client.get("/api/audit", headers=headers["lab"]).status_code == 403
    assert client.get("/api/audit", headers=headers["ehs"]).status_code == 200

    generation = {"date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
                  "moisture_pct": 90, "operating_days": 1}
    assert client.post("/api/generation", json=generation, headers=headers["op"]).status_code == 201
    denied = client.post("/api/generation", json=generation, headers=headers["lab"])
    assert denied.status_code == 403
    assert denied.json() == {"detail": "Insufficient permission"}

    lab_payload = {"date": "2026-11-27", "sample_id": "LAB-TEST-1", "ph": 7.0}
    assert client.post("/api/characterisation", json=lab_payload, headers=headers["lab"]).status_code == 201
    assert client.post("/api/characterisation", json=lab_payload, headers=headers["op"]).status_code == 403

    assert client.patch(
        "/api/compliance/1", json={"status": "Compliant"}, headers=headers["ehs"]
    ).status_code == 200
    assert client.delete("/api/generation/1", headers=headers["ehs"]).status_code == 403

    technology = client.get("/api/technology", headers=headers["op"]).json()
    assert client.put(
        "/api/technology", json={"weights": technology["weights"], "scores": technology["scores"]},
        headers=headers["op"],
    ).status_code == 403
    assert client.put(
        "/api/technology", json={"weights": technology["weights"], "scores": technology["scores"]},
        headers=headers["rootadm"],
    ).status_code == 200

    assert client.delete("/api/compliance/1", headers=headers["ehs"]).status_code == 403
    assert client.delete("/api/compliance/2", headers=headers["rootadm"]).status_code == 200
    assert client.get("/api/reports/data", headers=headers["rootadm"]).status_code == 200


def test_new_endpoints_always_require_authentication_even_in_shadow_mode(client):
    make_user("plain", "StrongPassword123!", ("administrator",))
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/users").status_code == 401
    assert client.get("/api/audit").status_code == 401
    assert client.post(
        "/api/auth/users",
        json={"username": "x", "password": "StrongPassword123", "roles": ["operator"]},
    ).status_code == 401
