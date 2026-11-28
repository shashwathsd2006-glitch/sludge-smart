"""Authentication, session management and central permission enforcement.

Passwords are hashed with PBKDF2-HMAC-SHA256. Only SHA-256 hashes of opaque
session tokens are stored; the raw token exists only in the login response.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request

from . import audit, config, db


@dataclass(frozen=True)
class Principal:
    id: int
    username: str
    roles: frozenset
    permissions: frozenset
    must_change_password: bool = False

    def as_actor(self) -> dict:
        return {"id": self.id, "username": self.username}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    iterations = config.PBKDF2_ITERATIONS
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(
        iterations,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_b64, digest_b64 = stored.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            base64.b64decode(salt_b64),
            int(iterations),
        )
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except (ValueError, TypeError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(conn, user_id: int) -> tuple[str, str]:
    token = new_token()
    expires = datetime.now(timezone.utc) + timedelta(seconds=config.SESSION_TTL_SECONDS)
    expires_at = expires.isoformat(timespec="seconds")
    conn.execute(
        """INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?)""",
        (token_hash(token), user_id, audit.utc_now(), expires_at, audit.utc_now()),
    )
    return token, expires_at


def revoke_session(conn, token: str) -> bool:
    cursor = conn.execute(
        "UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
        (audit.utc_now(), token_hash(token)),
    )
    return cursor.rowcount > 0


def revoke_other_sessions(
    conn, user_id: int, keep_token_hash: Optional[str] = None
) -> int:
    if keep_token_hash:
        cursor = conn.execute(
            """UPDATE user_sessions SET revoked_at = ?
               WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?""",
            (audit.utc_now(), user_id, keep_token_hash),
        )
    else:
        cursor = conn.execute(
            "UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
            (audit.utc_now(), user_id),
        )
    return int(cursor.rowcount)


def load_principal(user_id: int, conn=None) -> Optional[Principal]:
    user = db.fetch_one(
        "SELECT id, username, is_active, must_change_password FROM users WHERE id = ?",
        (user_id,),
        conn=conn,
    )
    if user is None or not user["is_active"]:
        return None
    roles = frozenset(
        row["name"]
        for row in db.fetch_all(
            """SELECT r.name FROM roles r
               JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?""",
            (user_id,),
            conn=conn,
        )
    )
    permissions = frozenset(
        row["code"]
        for row in db.fetch_all(
            """SELECT p.code FROM permissions p
               JOIN role_permissions rp ON rp.permission_id = p.id
               JOIN user_roles ur ON ur.role_id = rp.role_id
               WHERE ur.user_id = ?""",
            (user_id,),
            conn=conn,
        )
    )
    return Principal(
        user["id"],
        user["username"],
        roles,
        permissions,
        bool(user["must_change_password"]),
    )


def principal_from_token(token: str) -> Optional[Principal]:
    with db.transaction() as conn:
        row = db.fetch_one(
            """SELECT s.user_id, s.expires_at, s.revoked_at, u.is_active
               FROM user_sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ?""",
            (token_hash(token),),
            conn=conn,
        )
        if row is None or row["revoked_at"] is not None or not row["is_active"]:
            return None
        try:
            expiry = datetime.fromisoformat(row["expires_at"])
        except (TypeError, ValueError):
            return None
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) >= expiry:
            return None
        conn.execute(
            "UPDATE user_sessions SET last_seen_at = ? WHERE token_hash = ?",
            (audit.utc_now(), token_hash(token)),
        )
        return load_principal(row["user_id"], conn=conn)


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    return parts[1].strip()


def optional_principal(
    request: Request, authorization: Optional[str] = Header(default=None)
) -> Optional[Principal]:
    token = _bearer(authorization)
    return principal_from_token(token) if token else None


def _audit_denial(
    request: Request,
    principal: Optional[Principal],
    resource: str,
    detail: str,
    status: int,
) -> None:
    with db.transaction() as conn:
        audit.record_audit(
            conn,
            actor=principal.as_actor() if principal else None,
            action="PERMISSION_DENIED",
            resource=resource,
            outcome="failure",
            detail=f"{status}: {detail}",
            request=request,
        )


def current_principal(
    request: Request, authorization: Optional[str] = Header(default=None)
) -> Principal:
    principal = optional_principal(request, authorization)
    if principal is None:
        _audit_denial(request, None, "authentication", "Not authenticated", 401)
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


def has_permission(principal: Principal, code: str) -> bool:
    return "administrator" in principal.roles or code in principal.permissions


def _deny(request: Request, principal: Optional[Principal], code: str, status: int, detail: str):
    if config.AUTH_ENFORCEMENT:
        _audit_denial(request, principal, code, detail, status)
        raise HTTPException(status_code=status, detail=detail, headers={"WWW-Authenticate": "Bearer"} if status == 401 else None)
    _audit_denial(request, principal, code, f"shadow mode: {detail}", status)
    return None


def require_permission(code: str):
    def dependency(
        request: Request,
        principal: Optional[Principal] = Depends(optional_principal),
    ) -> Optional[Principal]:
        if principal is None:
            return _deny(request, None, code, 401, "Not authenticated")
        if not has_permission(principal, code):
            return _deny(request, principal, code, 403, "Insufficient permission")
        return principal

    return dependency


def require_strict_permission(code: str):
    def dependency(
        request: Request,
        principal: Principal = Depends(current_principal),
    ) -> Principal:
        if not has_permission(principal, code):
            _audit_denial(request, principal, code, "Insufficient permission", 403)
            raise HTTPException(status_code=403, detail="Insufficient permission")
        return principal

    return dependency


def user_output(row: dict, conn=None) -> dict:
    roles = [
        item["name"]
        for item in db.fetch_all(
            """SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id
               WHERE ur.user_id = ? ORDER BY r.name""",
            (row["id"],),
            conn=conn,
        )
    ]
    return {
        "id": row["id"],
        "username": row["username"],
        "full_name": row["full_name"],
        "email": row["email"],
        "is_active": bool(row["is_active"]),
        "must_change_password": bool(row["must_change_password"]),
        "roles": roles,
        "created_at": row.get("created_at"),
        "last_login_at": row.get("last_login_at"),
    }


def ensure_bootstrap_admin() -> None:
    username = config.ADMIN_USERNAME
    secret = config.ADMIN_PASSWORD_HASH or config.ADMIN_PASSWORD
    if not username or not secret:
        return
    with db.transaction() as conn:
        if db.fetch_one("SELECT id FROM users WHERE username = ?", (username,), conn=conn):
            return
        stored = secret if config.ADMIN_PASSWORD_HASH else hash_password(secret)
        cursor = conn.execute(
            """INSERT INTO users (username, password_hash, full_name, email,
                                  is_active, must_change_password, password_changed_at)
               VALUES (?, ?, ?, ?, 1, 1, ?)""",
            (username, stored, config.ADMIN_FULL_NAME, config.ADMIN_EMAIL, audit.utc_now()),
        )
        role = db.fetch_one("SELECT id FROM roles WHERE name = 'administrator'", conn=conn)
        if role:
            conn.execute(
                "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
                (cursor.lastrowid, role["id"]),
            )
        audit.record_audit(
            conn,
            actor=None,
            action="CREATE",
            resource="users",
            record_id=cursor.lastrowid,
            after={"username": username, "roles": ["administrator"]},
            detail="bootstrap administrator from environment configuration",
        )


_FAILED: dict = {}
_FAILED_LOCK = threading.Lock()
_FAILURE_LIMIT = 10_000


def _prune_failures(now: float) -> None:
    expired = [key for key, state in _FAILED.items() if now - state[1] >= config.LOCKOUT_SECONDS]
    for key in expired:
        _FAILED.pop(key, None)
    overflow = len(_FAILED) - _FAILURE_LIMIT
    if overflow > 0:
        oldest = sorted(_FAILED.items(), key=lambda item: item[1][1])[:overflow]
        for key, _ in oldest:
            _FAILED.pop(key, None)


def login_allowed(ip: str, username: str) -> bool:
    now = time.time()
    key = (ip, username)
    with _FAILED_LOCK:
        _prune_failures(now)
        state = _FAILED.get(key)
        return not state or state[0] < config.MAX_FAILED_ATTEMPTS


def record_failed_login(ip: str, username: str) -> None:
    now = time.time()
    key = (ip, username)
    with _FAILED_LOCK:
        _prune_failures(now)
        attempts, _ = _FAILED.get(key, (0, now))
        _FAILED[key] = (attempts + 1, now)


def clear_login_failures(ip: str, username: str) -> None:
    with _FAILED_LOCK:
        _FAILED.pop((ip, username), None)
