import time
from datetime import datetime, timedelta, timezone

from app import audit, auth, config, db

from conftest import make_user, token_for


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _flag_user(username, flagged=True):
    with db.transaction() as conn:
        conn.execute(
            "UPDATE users SET must_change_password = ? WHERE username = ?",
            (int(flagged), username),
        )


def test_password_hash_is_salted_pbkdf2_and_verifies():
    first = auth.hash_password("StrongPassword123!")
    second = auth.hash_password("StrongPassword123!")
    assert first != second
    assert first.startswith("pbkdf2_sha256$310000$")
    assert "StrongPassword123!" not in first
    assert auth.verify_password("StrongPassword123!", first)
    assert not auth.verify_password("wrong-password", first)


def test_login_success_and_failure(client):
    make_user("alice", "StrongPassword123!", ("administrator",))
    response = client.post(
        "/api/auth/login", json={"username": "alice", "password": "StrongPassword123!"}
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_at"}
    assert body["token_type"] == "bearer"
    assert "password" not in body and "hash" not in body

    bad = client.post("/api/auth/login", json={"username": "alice", "password": "nope"})
    assert bad.status_code == 401
    assert bad.json() == {"detail": "Invalid credentials"}


def test_session_validation_and_expiry(client):
    make_user("bob", "StrongPassword123!", ("administrator",))
    token = token_for(client, "bob", "StrongPassword123!")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    expired = datetime.now(timezone.utc) - timedelta(seconds=5)
    with db.transaction() as conn:
        conn.execute(
            "UPDATE user_sessions SET expires_at = ? WHERE token_hash = ?",
            (expired.isoformat(), auth.token_hash(token)),
        )
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_logout_revokes_session(client):
    make_user("carol", "StrongPassword123!", ("administrator",))
    token = token_for(client, "carol", "StrongPassword123!")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/auth/logout", headers=headers).json() == {"logged_out": True}
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    stored = db.fetch_one(
        "SELECT token_hash, revoked_at FROM user_sessions WHERE token_hash = ?",
        (auth.token_hash(token),),
    )
    assert stored["revoked_at"] is not None
    assert stored["token_hash"] != token


def test_user_registration_is_admin_controlled_and_hashes_password(client):
    make_user("root", "StrongPassword123!", ("administrator",))
    make_user("labonly", "StrongPassword123!", ("laboratory",))
    root_headers = {"Authorization": f"Bearer {token_for(client, 'root', 'StrongPassword123!')}"}
    lab_headers = {"Authorization": f"Bearer {token_for(client, 'labonly', 'StrongPassword123!')}"}

    payload = {
        "username": "new.operator",
        "password": "AnotherStrongPassword1",
        "full_name": "New Operator",
        "email": "operator@example.invalid",
        "roles": ["operator"],
    }
    assert client.post("/api/auth/users", json=payload).status_code == 401
    assert client.post("/api/auth/users", json=payload, headers=lab_headers).status_code == 403

    created = client.post("/api/auth/users", json=payload, headers=root_headers)
    assert created.status_code == 201
    body = created.json()
    assert set(body) == {
        "id", "username", "full_name", "email", "is_active",
        "must_change_password", "roles", "created_at", "last_login_at",
    }
    assert body["roles"] == ["operator"]
    assert "password" not in body

    row = db.fetch_one("SELECT password_hash FROM users WHERE username = ?", ("new.operator",))
    assert row["password_hash"].startswith("pbkdf2_sha256$")
    assert "AnotherStrongPassword1" not in row["password_hash"]
    assert client.post("/api/auth/users", json=payload, headers=root_headers).status_code == 409

    listing = client.get("/api/auth/users", headers=root_headers)
    assert listing.status_code == 200
    assert listing.json()["total"] >= 3
    assert all("password_hash" not in item for item in listing.json()["items"])


def test_user_update_requires_admin_and_audits_changes(client):
    make_user("root", "StrongPassword123!", ("administrator",))
    headers = {"Authorization": f"Bearer {token_for(client, 'root', 'StrongPassword123!')}"}
    created = client.post(
        "/api/auth/users",
        json={"username": "reviewer", "password": "ReviewerPassword123", "roles": ["ehs_reviewer"]},
        headers=headers,
    )
    user_id = created.json()["id"]
    updated = client.patch(
        f"/api/auth/users/{user_id}", json={"is_active": False, "roles": ["operator"]}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False
    assert updated.json()["roles"] == ["operator"]

    row = db.fetch_one(
        "SELECT actor_username, action, resource, changed_fields FROM audit_logs WHERE action = 'UPDATE' AND resource = 'users'"
    )
    assert row["actor_username"] == "root"
    assert "is_active" in row["changed_fields"]


def test_denied_audit_rows_do_not_contain_credentials(client):
    make_user("dave", "StrongPassword123!", ("administrator",))
    client.post("/api/auth/login", json={"username": "dave", "password": "WrongPassword123"})
    rows = db.fetch_all("SELECT * FROM audit_logs WHERE action = 'LOGIN_FAILED'")
    assert rows
    for row in rows:
        assert "StrongPassword123" not in str(row)
        assert "WrongPassword123" not in str(row)


def test_failed_login_threshold_locks_account_and_returns_423(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_FAILED_ATTEMPTS", 2)
    monkeypatch.setattr(config, "LOCKOUT_SECONDS", 60)
    make_user("lockout.user", "StrongPassword123!", ("administrator",))
    key = ("testclient", "lockout.user")
    bad = {"username": "lockout.user", "password": "WrongPassword123"}

    first = client.post("/api/auth/login", json=bad)
    assert first.status_code == 401
    assert first.json() == {"detail": "Invalid credentials"}
    row = db.fetch_one(
        "SELECT failed_attempts, locked_until FROM users WHERE username = ?", ("lockout.user",)
    )
    assert row["failed_attempts"] == 1
    assert row["locked_until"] is None
    assert auth._FAILED[key][0] == 1

    second = client.post("/api/auth/login", json=bad)
    assert second.status_code == 401
    row = db.fetch_one(
        "SELECT failed_attempts, locked_until FROM users WHERE username = ?", ("lockout.user",)
    )
    assert row["failed_attempts"] == 2
    locked_until = datetime.fromisoformat(row["locked_until"])
    now = datetime.now(timezone.utc)
    assert locked_until > now
    assert locked_until <= now + timedelta(seconds=61)
    assert auth._FAILED[key][0] == 2

    blocked = client.post(
        "/api/auth/login",
        json={"username": "lockout.user", "password": "StrongPassword123!"},
    )
    assert blocked.status_code == 423
    assert blocked.json() == {"detail": "Too many login attempts"}
    sessions = db.fetch_one(
        """SELECT COUNT(*) AS n FROM user_sessions
           WHERE user_id = (SELECT id FROM users WHERE username = ?)""",
        ("lockout.user",),
    )
    assert sessions["n"] == 0
    latest = db.fetch_one(
        "SELECT detail FROM audit_logs WHERE action = 'LOGIN_FAILED' ORDER BY id DESC LIMIT 1"
    )
    assert latest["detail"] == "rate limited"


def test_lockout_expiry_and_successful_login_reset_counters(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_FAILED_ATTEMPTS", 1)
    monkeypatch.setattr(config, "LOCKOUT_SECONDS", 60)
    make_user("expiry.user", "StrongPassword123!", ("administrator",))
    key = ("testclient", "expiry.user")
    bad = {"username": "expiry.user", "password": "WrongPassword123"}

    assert client.post("/api/auth/login", json=bad).status_code == 401
    row = db.fetch_one(
        "SELECT failed_attempts, locked_until FROM users WHERE username = ?", ("expiry.user",)
    )
    assert row["failed_attempts"] == 1
    assert row["locked_until"] is not None

    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(timespec="seconds")
    with db.transaction() as conn:
        conn.execute(
            "UPDATE users SET locked_until = ? WHERE username = ?", (past, "expiry.user")
        )
    auth._FAILED[key] = (auth._FAILED[key][0], time.time() - 61)

    success = client.post(
        "/api/auth/login",
        json={"username": "expiry.user", "password": "StrongPassword123!"},
    )
    assert success.status_code == 200
    assert set(success.json()) == {"access_token", "token_type", "expires_at"}
    row = db.fetch_one(
        "SELECT failed_attempts, locked_until FROM users WHERE username = ?", ("expiry.user",)
    )
    assert row["failed_attempts"] == 0
    assert row["locked_until"] is None
    assert key not in auth._FAILED


def test_successful_login_clears_partial_failed_attempts(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_FAILED_ATTEMPTS", 3)
    make_user("reset.user", "StrongPassword123!", ("administrator",))
    key = ("testclient", "reset.user")

    failed = client.post(
        "/api/auth/login", json={"username": "reset.user", "password": "WrongPassword123"}
    )
    assert failed.status_code == 401
    row = db.fetch_one(
        "SELECT failed_attempts, locked_until FROM users WHERE username = ?", ("reset.user",)
    )
    assert row["failed_attempts"] == 1
    assert row["locked_until"] is None
    assert key in auth._FAILED

    success = client.post(
        "/api/auth/login",
        json={"username": "reset.user", "password": "StrongPassword123!"},
    )
    assert success.status_code == 200
    row = db.fetch_one(
        "SELECT failed_attempts, locked_until FROM users WHERE username = ?", ("reset.user",)
    )
    assert row["failed_attempts"] == 0
    assert row["locked_until"] is None
    assert key not in auth._FAILED


def test_nonexistent_username_uses_same_error_and_locks_after_threshold(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_FAILED_ATTEMPTS", 2)
    monkeypatch.setattr(config, "LOCKOUT_SECONDS", 60)
    make_user("real.user", "StrongPassword123!", ("administrator",))

    existing = client.post(
        "/api/auth/login", json={"username": "real.user", "password": "WrongPassword123"}
    )
    ghost = client.post(
        "/api/auth/login", json={"username": "ghost.user", "password": "WrongPassword123"}
    )
    assert existing.status_code == ghost.status_code == 401
    assert existing.json() == ghost.json() == {"detail": "Invalid credentials"}

    payload = {"username": "ghost.user", "password": "WrongPassword123"}
    assert client.post("/api/auth/login", json=payload).status_code == 401
    locked = client.post("/api/auth/login", json=payload)
    assert locked.status_code == 423
    assert locked.json() == {"detail": "Too many login attempts"}
    assert db.fetch_one("SELECT id FROM users WHERE username = ?", ("ghost.user",)) is None
    assert auth._FAILED[("testclient", "ghost.user")][0] >= 2


def test_change_password_verifies_current_rejects_reuse_and_updates_credentials(client):
    make_user("changer", "OldPassword123!", ("administrator",))
    make_user("other.user", "OtherPassword123!", ("operator",))
    other_id = db.fetch_one("SELECT id FROM users WHERE username = ?", ("other.user",))["id"]
    headers = _headers(token_for(client, "changer", "OldPassword123!"))

    wrong = client.post(
        "/api/auth/change-password",
        json={"current_password": "WrongPassword123", "new_password": "NewPassword123!"},
        headers=headers,
    )
    assert wrong.status_code == 401
    assert wrong.json() == {"detail": "Invalid current password"}

    reuse = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "OldPassword123!"},
        headers=headers,
    )
    assert reuse.status_code == 400
    assert reuse.json() == {"detail": "New password must differ from current password"}

    short = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "short"},
        headers=headers,
    )
    assert short.status_code == 422

    extra = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "NewPassword123!",
              "user_id": other_id},
        headers=headers,
    )
    assert extra.status_code == 422

    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "NewPassword123!"},
        headers=headers,
    )
    assert changed.status_code == 200
    assert set(changed.json()) == {"changed", "sessions_revoked"}
    assert changed.json()["changed"] is True

    row = db.fetch_one(
        "SELECT password_hash, must_change_password, password_changed_at FROM users WHERE username = ?",
        ("changer",),
    )
    assert row["must_change_password"] == 0
    assert row["password_changed_at"] is not None
    assert not auth.verify_password("OldPassword123!", row["password_hash"])
    assert auth.verify_password("NewPassword123!", row["password_hash"])

    assert client.post(
        "/api/auth/login", json={"username": "changer", "password": "OldPassword123!"}
    ).status_code == 401
    assert client.post(
        "/api/auth/login", json={"username": "changer", "password": "NewPassword123!"}
    ).status_code == 200

    events = db.fetch_all(
        "SELECT outcome, detail FROM audit_logs WHERE action = 'PASSWORD_CHANGE' ORDER BY id"
    )
    assert [event["outcome"] for event in events] == ["failure", "failure", "success"]
    assert all(
        "OldPassword123!" not in str(event) and "NewPassword123!" not in str(event)
        for event in events
    )


def test_password_change_keeps_current_session_and_revokes_others(client):
    make_user("session.user", "OldPassword123!", ("administrator",))
    current = token_for(client, "session.user", "OldPassword123!")
    other = token_for(client, "session.user", "OldPassword123!")
    current_headers = _headers(current)
    other_headers = _headers(other)

    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "NewPassword123!"},
        headers=current_headers,
    )
    assert changed.status_code == 200
    assert changed.json()["sessions_revoked"] == 1
    assert client.get("/api/auth/me", headers=current_headers).status_code == 200
    assert client.get("/api/auth/me", headers=other_headers).status_code == 401

    rows = {
        row["token_hash"]: row["revoked_at"]
        for row in db.fetch_all("SELECT token_hash, revoked_at FROM user_sessions")
    }
    assert rows[auth.token_hash(current)] is None
    assert rows[auth.token_hash(other)] is not None


def test_admin_reset_requires_admin_sets_flag_revokes_sessions_and_audits_safely(client):
    make_user("reset.admin", "AdminPassword123!", ("administrator",))
    make_user("target.user", "OldPassword123!", ("operator",))
    make_user("plain.user", "PlainPassword123!", ("operator",))
    admin_headers = _headers(token_for(client, "reset.admin", "AdminPassword123!"))
    plain_headers = _headers(token_for(client, "plain.user", "PlainPassword123!"))
    target_id = db.fetch_one("SELECT id FROM users WHERE username = ?", ("target.user",))["id"]
    old_token = token_for(client, "target.user", "OldPassword123!")

    denied = client.post(
        f"/api/auth/users/{target_id}/reset-password", headers=plain_headers
    )
    assert denied.status_code == 403

    reset = client.post(
        f"/api/auth/users/{target_id}/reset-password", headers=admin_headers
    )
    assert reset.status_code == 200
    body = reset.json()
    assert set(body) == {"reset", "temporary_password", "sessions_revoked"}
    temporary_password = body["temporary_password"]
    assert len(temporary_password) >= 16
    assert "password_hash" not in body

    row = db.fetch_one(
        "SELECT password_hash, must_change_password, password_changed_at FROM users WHERE id = ?",
        (target_id,),
    )
    assert row["must_change_password"] == 1
    assert row["password_changed_at"] is not None
    assert auth.verify_password(temporary_password, row["password_hash"])
    assert not auth.verify_password("OldPassword123!", row["password_hash"])

    assert client.get("/api/auth/me", headers=_headers(old_token)).status_code == 401
    login = client.post(
        "/api/auth/login",
        json={"username": "target.user", "password": temporary_password},
    )
    assert login.status_code == 200

    events = db.fetch_all(
        "SELECT actor_username, action, resource, detail, after_values FROM audit_logs WHERE action = 'PASSWORD_RESET'"
    )
    assert len(events) == 1
    assert events[0]["actor_username"] == "reset.admin"
    assert events[0]["resource"] == "users"
    assert temporary_password not in str(events[0])
    assert row["password_hash"] not in str(events[0])

    filtered = client.get("/api/audit?action=PASSWORD_RESET", headers=admin_headers)
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1


def test_flagged_roles_login_directly_and_rbac_still_applies(client, monkeypatch):
    accounts = {
        "flag.admin": ("administrator", "/api/generation"),
        "flag.operator": ("operator", "/api/generation"),
        "flag.laboratory": ("laboratory", "/api/characterisation"),
        "flag.ehs": ("ehs_reviewer", "/api/compliance"),
    }
    headers_by_role = {}
    for username, (role, _) in accounts.items():
        make_user(username, "StrongPassword123!", (role,))
        _flag_user(username, True)
        token = token_for(client, username, "StrongPassword123!")
        headers_by_role[role] = _headers(token)
        current = client.get("/api/auth/me", headers=headers_by_role[role])
        assert current.status_code == 200
        assert current.json()["roles"] == [role]
        assert current.json()["must_change_password"] is True
        row = db.fetch_one(
            "SELECT must_change_password FROM users WHERE username = ?", (username,)
        )
        assert row["must_change_password"] == 1

    invalid = client.post(
        "/api/auth/login",
        json={"username": "flag.admin", "password": "WrongPassword123!"},
    )
    assert invalid.status_code == 401

    for mode in (False, True):
        monkeypatch.setattr(config, "AUTH_ENFORCEMENT", mode)
        for _, (role, read_path) in accounts.items():
            response = client.get(read_path, headers=headers_by_role[role])
            assert response.status_code == 200
            assert "X-Password-Change-Required" not in response.headers

    monkeypatch.setattr(config, "AUTH_ENFORCEMENT", True)
    generation_payload = {
        "date": "2026-11-27", "wastewater_m3": 10, "wet_sludge_kg": 20,
        "moisture_pct": 90, "operating_days": 1,
    }
    assert client.post(
        "/api/generation", json=generation_payload, headers=headers_by_role["administrator"]
    ).status_code == 201
    assert client.post(
        "/api/generation", json=generation_payload, headers=headers_by_role["operator"]
    ).status_code == 201
    assert client.post(
        "/api/generation", json=generation_payload, headers=headers_by_role["laboratory"]
    ).status_code == 403
    assert client.post(
        "/api/characterisation", json={"date": "2026-11-27", "sample_id": "RBAC-DIRECT-1", "ph": 7.1},
        headers=headers_by_role["operator"],
    ).status_code == 403
    assert client.post(
        "/api/generation", json=generation_payload, headers=headers_by_role["ehs_reviewer"]
    ).status_code == 403
