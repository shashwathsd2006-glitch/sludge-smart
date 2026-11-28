"""Test setup. All tests use temporary SQLite files; the live data/ DB is never touched."""

import os
import tempfile
from pathlib import Path

_TEST_DB = Path(tempfile.gettempdir()) / "sludge_smart_phase1_tests.db"
os.environ["SLUDGE_SMART_DB_PATH"] = str(_TEST_DB)
os.environ.pop("SLUDGE_SMART_ADMIN_USERNAME", None)
os.environ.pop("SLUDGE_SMART_ADMIN_PASSWORD", None)
os.environ.pop("SLUDGE_SMART_ADMIN_PASSWORD_HASH", None)
os.environ["AUTH_ENFORCEMENT"] = "false"

import pytest
from fastapi.testclient import TestClient

from app import audit, auth, config, db, migrations
from app.main import app


@pytest.fixture
def db_env(monkeypatch, tmp_path):
    path = tmp_path / "test.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(config, "DB_PATH", path)
    monkeypatch.setattr(config, "AUTH_ENFORCEMENT", False)
    auth._FAILED.clear()
    db.init_db()
    migrations.run_migrations()
    return path


@pytest.fixture
def client(db_env):
    with TestClient(app) as test_client:
        yield test_client


def make_user(username, password, roles=("administrator",)):
    with db.transaction() as conn:
        cursor = conn.execute(
            """INSERT INTO users (username, password_hash, full_name, email,
                                  is_active, must_change_password)
               VALUES (?, ?, ?, ?, 1, 0)""",
            (username, auth.hash_password(password), username, ""),
        )
        for role in roles:
            conn.execute(
                "INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?",
                (cursor.lastrowid, role),
            )
    return username


def token_for(client, username, password):
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]
