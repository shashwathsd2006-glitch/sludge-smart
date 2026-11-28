"""Append-only audit trail helpers.

Audit records are written from the same database transaction as the business
change they describe. Credential fields are redacted before serialisation and
anonymous activity is recorded as anonymous rather than attributed to a user.
"""

from __future__ import annotations

import json
import sqlite3
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Optional

REQUEST_ID: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

SENSITIVE_PARTS = ("password", "token", "secret", "credential", "hash")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def new_request_id() -> str:
    import uuid

    return uuid.uuid4().hex


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: ("[REDACTED]" if any(part in str(key).lower() for part in SENSITIVE_PARTS)
                  else redact(item))
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    return value


def encode(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(redact(value), sort_keys=True, default=str)


def changed_keys(before: Any, after: Any) -> list[str]:
    if not isinstance(before, dict) or not isinstance(after, dict):
        return []
    return sorted(key for key in set(before) | set(after) if before.get(key) != after.get(key))


def safe_user(row: Optional[dict]) -> dict:
    if not row:
        return {}
    return {
        key: value
        for key, value in row.items()
        if not any(part in key.lower() for part in SENSITIVE_PARTS)
    }


def record_audit(
    conn: sqlite3.Connection,
    *,
    actor: Optional[dict],
    action: str,
    resource: str,
    record_id: Any = None,
    before: Any = None,
    after: Any = None,
    changed_fields: Optional[list[str]] = None,
    outcome: str = "success",
    detail: str = "",
    request: Any = None,
    request_id: Optional[str] = None,
) -> int:
    correlation = request_id or REQUEST_ID.get()
    if correlation is None and request is not None:
        correlation = request.headers.get("X-Request-ID")
    cursor = conn.execute(
        """INSERT INTO audit_logs
           (timestamp, actor_user_id, actor_username, action, resource, record_id,
            before_values, after_values, changed_fields, outcome, detail,
            ip_address, user_agent, request_id)
           VALUES (:timestamp, :actor_user_id, :actor_username, :action, :resource,
                   :record_id, :before_values, :after_values, :changed_fields,
                   :outcome, :detail, :ip_address, :user_agent, :request_id)""",
        {
            "timestamp": utc_now(),
            "actor_user_id": actor.get("id") if actor else None,
            "actor_username": actor.get("username") if actor else "anonymous",
            "action": action,
            "resource": resource,
            "record_id": None if record_id is None else str(record_id),
            "before_values": encode(before),
            "after_values": encode(after),
            "changed_fields": encode(changed_fields),
            "outcome": outcome,
            "detail": str(detail)[:1000],
            "ip_address": (request.client.host if request is not None and request.client else None),
            "user_agent": (request.headers.get("User-Agent", "")[:500] if request is not None else ""),
            "request_id": correlation,
        },
    )
    return int(cursor.lastrowid)
