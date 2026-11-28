import sqlite3

from app import audit, db

from conftest import make_user, token_for


def test_legacy_anonymous_activity_is_recorded_as_anonymous(client):
    response = client.post(
        "/api/generation",
        headers={"X-Request-ID": "correlation-123"},
        json={"date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
              "moisture_pct": 90, "operating_days": 1},
    )
    record_id = response.json()["id"]
    rows = db.fetch_all("SELECT * FROM audit_logs WHERE resource = 'generation_records'")
    assert len(rows) == 1
    row = rows[0]
    assert row["actor_user_id"] is None
    assert row["actor_username"] == "anonymous"
    assert row["action"] == "CREATE"
    assert row["record_id"] == str(record_id)
    assert row["request_id"] == "correlation-123"
    assert '"wastewater_m3": 10.0' in row["after_values"]

    client.delete(f"/api/generation/{record_id}")
    deleted = db.fetch_one("SELECT * FROM audit_logs WHERE action = 'DELETE' AND record_id = ?", (str(record_id),))
    assert deleted["actor_username"] == "anonymous"
    assert '"wastewater_m3": 10.0' in deleted["before_values"]
    assert deleted["after_values"] is None


def test_authenticated_update_captures_before_after_and_changed_fields(client):
    make_user("auditor", "StrongPassword123!", ("administrator",))
    headers = {"Authorization": f"Bearer {token_for(client, 'auditor', 'StrongPassword123!')}"}
    before = db.fetch_one("SELECT * FROM compliance_items WHERE id = 1")
    updated = client.patch(
        "/api/compliance/1", json={"detail": "Verified today"}, headers=headers
    )
    assert updated.status_code == 200
    row = db.fetch_one(
        "SELECT * FROM audit_logs WHERE action = 'UPDATE' AND resource = 'compliance_items'"
    )
    assert row["actor_username"] == "auditor"
    assert row["actor_user_id"] is not None
    assert "detail" in row["changed_fields"]
    assert before["detail"] in row["before_values"]
    assert "Verified today" in row["after_values"]


def test_compliance_transition_to_compliant_is_approval(client):
    make_user("ehs", "StrongPassword123!", ("ehs_reviewer",))
    headers = {"Authorization": f"Bearer {token_for(client, 'ehs', 'StrongPassword123!')}"}
    assert client.patch("/api/compliance/2", json={"status": "Compliant"}, headers=headers).status_code == 200
    row = db.fetch_one("SELECT * FROM audit_logs WHERE action = 'APPROVAL'")
    assert row and row["resource"] == "compliance_items"
    assert row["actor_username"] == "ehs"


def test_auth_events_and_credential_redaction(client):
    make_user("secure", "StrongPassword123!", ("administrator",))
    token = token_for(client, "secure", "StrongPassword123!")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout", headers=headers).status_code == 200

    actions = {row["action"] for row in db.fetch_all("SELECT action FROM audit_logs")}
    assert {"LOGIN", "LOGOUT"} <= actions
    payload = audit.encode({"password": "Secret123", "nested": {"access_token": "abc"}, "status": "ok"})
    assert "Secret123" not in payload and "abc" not in payload
    assert "[REDACTED]" in payload and '"status": "ok"' in payload

    for row in db.fetch_all("SELECT before_values, after_values, detail FROM audit_logs"):
        assert "StrongPassword123" not in str(row)
        assert token not in str(row)


def test_audit_log_is_append_only(client):
    make_user("admin", "StrongPassword123!", ("administrator",))
    headers = {"Authorization": f"Bearer {token_for(client, 'admin', 'StrongPassword123!')}"}
    audit_id = db.fetch_one("SELECT id FROM audit_logs ORDER BY id LIMIT 1")["id"]
    client.post(
        "/api/generation",
        json={"date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
              "moisture_pct": 90, "operating_days": 1},
        headers=headers,
    )
    with db.transaction() as conn:
        try:
            conn.execute("UPDATE audit_logs SET detail = 'tampered' WHERE id = ?", (audit_id,))
            assert False, "UPDATE should have been rejected"
        except sqlite3.IntegrityError:
            pass
        try:
            conn.execute("DELETE FROM audit_logs WHERE id = ?", (audit_id,))
            assert False, "DELETE should have been rejected"
        except sqlite3.IntegrityError:
            pass
    assert client.patch(f"/api/audit/{audit_id}", json={}, headers=headers).status_code in (404, 405)
    assert client.delete(f"/api/audit/{audit_id}", headers=headers).status_code in (404, 405)

    listing = client.get("/api/audit?action=CREATE&resource=generation_records", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert body["total"] == 1
    assert body["items"][0]["actor_username"] == "admin"
    assert client.get("/api/audit?action=DROP", headers=headers).status_code == 400


def test_password_management_fields_are_redacted():
    encoded = audit.encode({
        "current_password": "Current123!",
        "new_password": "New123!",
        "password_hash": "hash-value",
        "temporary_password": "Temp123!",
        "status": "ok",
    })
    for secret in ("Current123!", "New123!", "hash-value", "Temp123!"):
        assert secret not in encoded
    assert encoded.count("[REDACTED]") == 4
    assert '"status": "ok"' in encoded
