"""Authentication, user administration and audit inspection endpoints.

These endpoints are new and always require a valid token, independently of the
AUTH_ENFORCEMENT compatibility flag that governs legacy endpoints.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from . import audit, auth, config, db
from .schemas import (
    AuditListOut,
    LoginIn,
    PasswordChangeIn,
    TokenOut,
    UserCreate,
    UserListOut,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/api")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_filter(value: str, name: str) -> datetime:
    parsed = _parse(value)
    if parsed is None:
        raise HTTPException(status_code=400, detail=f"Invalid {name} timestamp")
    return parsed


@router.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request) -> dict:
    ip = request.client.host if request.client else "unknown"
    username = payload.username
    now = _now()
    if not auth.login_allowed(ip, username):
        with db.transaction() as conn:
            audit.record_audit(
                conn,
                actor={"id": None, "username": username},
                action="LOGIN_FAILED",
                resource="auth",
                outcome="failure",
                detail="rate limited",
                request=request,
            )
        raise HTTPException(status_code=423, detail="Too many login attempts")

    token = ""
    expires_at = ""
    failure_status: Optional[int] = None
    clear_failures = False
    record_failure = False
    with db.transaction() as conn:
        user = db.fetch_one("SELECT * FROM users WHERE username = ?", (username,), conn=conn)
        locked_until = _parse(user["locked_until"]) if user else None
        if user and locked_until and locked_until <= now:
            conn.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?",
                (user["id"],),
            )
            user = db.fetch_one("SELECT * FROM users WHERE id = ?", (user["id"],), conn=conn)
            locked_until = None

        if user and locked_until and locked_until > now:
            failure_status = 423
            audit.record_audit(
                conn,
                actor={"id": user["id"], "username": username},
                action="LOGIN_FAILED",
                resource="auth",
                outcome="failure",
                detail="rate limited",
                request=request,
            )
        elif user and user["is_active"] and auth.verify_password(payload.password, user["password_hash"]):
            clear_failures = True
            token, expires_at = auth.create_session(conn, user["id"])
            actor = {"id": user["id"], "username": username}
            conn.execute(
                """UPDATE users SET last_login_at = ?, failed_attempts = 0, locked_until = NULL
                   WHERE id = ?""",
                (audit.utc_now(), user["id"]),
            )
            audit.record_audit(
                conn,
                actor=actor,
                action="LOGIN",
                resource="auth",
                record_id=user["id"],
                detail="session created",
                request=request,
            )
        else:
            failure_status = 401
            record_failure = True
            if user:
                attempts = int(user["failed_attempts"] or 0) + 1
                locked = (
                    (now + timedelta(seconds=config.LOCKOUT_SECONDS)).isoformat(timespec="seconds")
                    if attempts >= config.MAX_FAILED_ATTEMPTS
                    else None
                )
                conn.execute(
                    "UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?",
                    (attempts, locked, user["id"]),
                )
            audit.record_audit(
                conn,
                actor={"id": user["id"] if user else None, "username": username},
                action="LOGIN_FAILED",
                resource="auth",
                outcome="failure",
                detail="invalid credentials or locked account",
                request=request,
            )

    if clear_failures:
        auth.clear_login_failures(ip, username)
    elif record_failure:
        auth.record_failed_login(ip, username)

    if failure_status == 423:
        raise HTTPException(status_code=423, detail="Too many login attempts")
    if failure_status == 401:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": token, "token_type": "bearer", "expires_at": expires_at}


@router.post("/auth/logout")
def logout(
    request: Request,
    principal: auth.Principal = Depends(auth.current_principal),
    authorization: Optional[str] = Header(default=None),
) -> dict:
    token = auth._bearer(authorization)
    with db.transaction() as conn:
        if token:
            auth.revoke_session(conn, token)
        audit.record_audit(
            conn, actor=principal.as_actor(), action="LOGOUT", resource="auth",
            record_id=principal.id, request=request,
        )
    return {"logged_out": True}


@router.get("/auth/me", response_model=UserOut)
def me(principal: auth.Principal = Depends(auth.current_principal)) -> dict:
    with db.transaction() as conn:
        row = db.fetch_one("SELECT * FROM users WHERE id = ?", (principal.id,), conn=conn)
        return auth.user_output(row, conn=conn)


@router.post("/auth/change-password")
def change_password(
    payload: PasswordChangeIn,
    request: Request,
    principal: auth.Principal = Depends(auth.current_principal),
    authorization: Optional[str] = Header(default=None),
) -> dict:
    token = auth._bearer(authorization)
    keep_hash = auth.token_hash(token) if token else None
    failure_status: Optional[int] = None
    failure_detail = ""
    revoked = 0
    with db.transaction() as conn:
        row = db.fetch_one(
            "SELECT password_hash FROM users WHERE id = ?", (principal.id,), conn=conn
        )
        if row is None:
            failure_status, failure_detail = 401, "Not authenticated"
        elif not auth.verify_password(payload.current_password, row["password_hash"]):
            failure_status, failure_detail = 401, "Invalid current password"
            audit.record_audit(
                conn, actor=principal.as_actor(), action="PASSWORD_CHANGE",
                resource="auth", record_id=principal.id, outcome="failure",
                detail="current password verification failed", request=request,
            )
        elif auth.verify_password(payload.new_password, row["password_hash"]):
            failure_status, failure_detail = 400, "New password must differ from current password"
            audit.record_audit(
                conn, actor=principal.as_actor(), action="PASSWORD_CHANGE",
                resource="auth", record_id=principal.id, outcome="failure",
                detail="new password matched current password", request=request,
            )
        else:
            changed_at = audit.utc_now()
            conn.execute(
                """UPDATE users SET password_hash = ?, must_change_password = 0,
                                    password_changed_at = ?, failed_attempts = 0,
                                    locked_until = NULL, updated_at = ?
                   WHERE id = ?""",
                (auth.hash_password(payload.new_password), changed_at, changed_at, principal.id),
            )
            revoked = auth.revoke_other_sessions(
                conn, principal.id, keep_token_hash=keep_hash
            )
            audit.record_audit(
                conn, actor=principal.as_actor(), action="PASSWORD_CHANGE",
                resource="auth", record_id=principal.id,
                after={"must_change_password": False, "password_changed_at": changed_at,
                       "sessions_revoked": revoked},
                detail="password changed; other sessions revoked", request=request,
            )
    if failure_status is not None:
        raise HTTPException(status_code=failure_status, detail=failure_detail)
    return {"changed": True, "sessions_revoked": revoked}


@router.post("/auth/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    request: Request,
    principal: auth.Principal = Depends(auth.require_strict_permission("users:write")),
) -> dict:
    with db.transaction() as conn:
        if db.fetch_one("SELECT id FROM users WHERE username = ?", (payload.username,), conn=conn):
            raise HTTPException(status_code=409, detail="Username already exists")
        stored = auth.hash_password(payload.password)
        try:
            cursor = conn.execute(
                """INSERT INTO users (username, password_hash, full_name, email,
                                      is_active, must_change_password, password_changed_at)
                   VALUES (?, ?, ?, ?, 1, 1, ?)""",
                (payload.username, stored, payload.full_name, payload.email, audit.utc_now()),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Username already exists") from exc
        user_id = cursor.lastrowid
        names = sorted(set(payload.roles))
        placeholders = ",".join("?" for _ in names)
        roles = db.fetch_all(
            f"SELECT id, name FROM roles WHERE name IN ({placeholders})", tuple(names), conn=conn
        )
        for role in roles:
            conn.execute(
                "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
                (user_id, role["id"]),
            )
        row = db.fetch_one("SELECT * FROM users WHERE id = ?", (user_id,), conn=conn)
        result = auth.user_output(row, conn=conn)
        audit.record_audit(
            conn, actor=principal.as_actor(), action="CREATE", resource="users",
            record_id=user_id, after=result, request=request,
        )
    return result


@router.get("/auth/users", response_model=UserListOut)
def list_users(
    principal: auth.Principal = Depends(auth.require_strict_permission("users:read")),
) -> dict:
    with db.transaction() as conn:
        items = [
            auth.user_output(row, conn=conn)
            for row in db.fetch_all("SELECT * FROM users ORDER BY id", conn=conn)
        ]
    return {"items": items, "total": len(items)}


@router.patch("/auth/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    principal: auth.Principal = Depends(auth.require_strict_permission("users:write")),
) -> dict:
    with db.transaction() as conn:
        row = db.fetch_one("SELECT * FROM users WHERE id = ?", (user_id,), conn=conn)
        if row is None:
            raise HTTPException(status_code=404, detail="User not found")
        before = auth.user_output(row, conn=conn)
        values = payload.model_dump(exclude_none=True)
        roles = values.pop("roles", None)
        if "is_active" in values:
            values["is_active"] = int(bool(values["is_active"]))
        if "must_change_password" in values:
            values["must_change_password"] = int(bool(values["must_change_password"]))
        if values:
            names = auth.db.validate_columns(values.keys())
            assignments = ", ".join(f"{name} = :{name}" for name in names)
            conn.execute(
                f"UPDATE users SET {assignments}, updated_at = :updated_at WHERE id = :id",
                {**values, "updated_at": audit.utc_now(), "id": user_id},
            )
        if roles is not None:
            conn.execute("DELETE FROM user_roles WHERE user_id = ?", (user_id,))
            placeholders = ",".join("?" for _ in roles)
            found = db.fetch_all(
                f"SELECT id FROM roles WHERE name IN ({placeholders})", tuple(roles), conn=conn
            )
            for role in found:
                conn.execute(
                    "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
                    (user_id, role["id"]),
                )
            if len(found) != len(set(roles)):
                raise HTTPException(status_code=400, detail="Unknown role")
        updated = db.fetch_one("SELECT * FROM users WHERE id = ?", (user_id,), conn=conn)
        result = auth.user_output(updated, conn=conn)
        audit.record_audit(
            conn, actor=principal.as_actor(), action="UPDATE", resource="users",
            record_id=user_id, before=before, after=result,
            changed_fields=audit.changed_keys(before, result), request=request,
        )
    return result


@router.post("/auth/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    request: Request,
    principal: auth.Principal = Depends(auth.require_strict_permission("users:write")),
) -> dict:
    temporary_password = auth.new_token()
    changed_at = audit.utc_now()
    not_found = False
    revoked = 0
    with db.transaction() as conn:
        row = db.fetch_one("SELECT id FROM users WHERE id = ?", (user_id,), conn=conn)
        if row is None:
            not_found = True
            audit.record_audit(
                conn, actor=principal.as_actor(), action="PASSWORD_RESET",
                resource="users", record_id=user_id, outcome="failure",
                detail="user not found", request=request,
            )
        else:
            conn.execute(
                """UPDATE users SET password_hash = ?, must_change_password = 1,
                                    password_changed_at = ?, failed_attempts = 0,
                                    locked_until = NULL, updated_at = ?
                   WHERE id = ?""",
                (
                    auth.hash_password(temporary_password),
                    changed_at,
                    changed_at,
                    user_id,
                ),
            )
            revoked = auth.revoke_other_sessions(conn, user_id)
            audit.record_audit(
                conn, actor=principal.as_actor(), action="PASSWORD_RESET",
                resource="users", record_id=user_id,
                after={"must_change_password": True, "password_changed_at": changed_at,
                       "sessions_revoked": revoked},
                detail="temporary password issued; all sessions revoked",
                request=request,
            )
    if not_found:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "reset": True,
        "temporary_password": temporary_password,
        "sessions_revoked": revoked,
    }


@router.get("/audit", response_model=AuditListOut)
def list_audit(
    request: Request,
    principal: auth.Principal = Depends(auth.require_strict_permission("audit:read")),
    action: Optional[str] = Query(default=None, max_length=64),
    resource: Optional[str] = Query(default=None, max_length=64),
    actor_user_id: Optional[int] = Query(default=None, ge=1),
    from_ts: Optional[str] = Query(default=None, max_length=40),
    to_ts: Optional[str] = Query(default=None, max_length=40),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    filters: dict = {}
    clauses = []
    allowed_actions = {
        "CREATE", "UPDATE", "DELETE", "LOGIN", "LOGIN_FAILED", "LOGOUT",
        "APPROVAL", "PERMISSION_DENIED", "PASSWORD_CHANGE", "PASSWORD_RESET",
    }
    allowed_resources = set(db.ALLOWED_TABLES) | {"auth"}
    allowed_resources.update(row["code"] for row in db.fetch_all("SELECT code FROM permissions"))
    if action:
        if action not in allowed_actions:
            raise HTTPException(status_code=400, detail="Unknown action")
        clauses.append("action = :action")
        filters["action"] = action
    if resource:
        if resource not in allowed_resources:
            raise HTTPException(status_code=400, detail="Unknown resource")
        clauses.append("resource = :resource")
        filters["resource"] = resource
    if actor_user_id is not None:
        clauses.append("actor_user_id = :actor_user_id")
        filters["actor_user_id"] = actor_user_id
    start = _parse_filter(from_ts, "from_ts") if from_ts else None
    end = _parse_filter(to_ts, "to_ts") if to_ts else None
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="from_ts must be before to_ts")
    if start:
        clauses.append("timestamp >= :from_ts")
        filters["from_ts"] = start.isoformat()
    if end:
        clauses.append("timestamp <= :to_ts")
        filters["to_ts"] = end.isoformat()
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with db.transaction() as conn:
        total = db.fetch_one(f"SELECT COUNT(*) AS n FROM audit_logs{where}", filters, conn=conn)["n"]
        rows = db.fetch_all(
            f"SELECT * FROM audit_logs{where} ORDER BY id DESC LIMIT :limit OFFSET :offset",
            {**filters, "limit": limit, "offset": offset},
            conn=conn,
        )
    return {"items": rows, "total": total, "limit": limit, "offset": offset}
