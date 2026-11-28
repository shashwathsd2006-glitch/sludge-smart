"""Environment-driven configuration for SLUDGE SMART Phase 1.

All settings have safe, backwards-compatible defaults. No secret value is
hard-coded; credentials used for bootstrap must be supplied by the operator.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _integer(name: str, default: int, minimum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


AUTH_ENFORCEMENT = _flag("AUTH_ENFORCEMENT", False)


def _db_path() -> Path:
    raw = os.getenv("SLUDGE_SMART_DB_PATH")
    path = Path(raw) if raw else ROOT / "data" / "sludge_smart.db"
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


DB_PATH = _db_path()

DEFAULT_ORIGINS = "http://localhost:5300,http://127.0.0.1:5300"
TRUSTED_ORIGINS = tuple(
    origin.strip()
    for origin in os.getenv("TRUSTED_ORIGINS", DEFAULT_ORIGINS).split(",")
    if origin.strip() and origin.strip() != "*"
) or tuple(origin.strip() for origin in DEFAULT_ORIGINS.split(","))

SESSION_TTL_SECONDS = _integer("SESSION_TTL_SECONDS", 8 * 60 * 60, 60)
PBKDF2_ITERATIONS = _integer("PBKDF2_ITERATIONS", 310_000, 100_000)
MAX_FAILED_ATTEMPTS = _integer("MAX_FAILED_ATTEMPTS", 5, 1)
LOCKOUT_SECONDS = _integer("LOCKOUT_SECONDS", 15 * 60, 30)

ADMIN_USERNAME = os.getenv("SLUDGE_SMART_ADMIN_USERNAME", "").strip()
ADMIN_PASSWORD = os.getenv("SLUDGE_SMART_ADMIN_PASSWORD", "")
ADMIN_PASSWORD_HASH = os.getenv("SLUDGE_SMART_ADMIN_PASSWORD_HASH", "").strip()
ADMIN_FULL_NAME = os.getenv("SLUDGE_SMART_ADMIN_FULL_NAME", "Administrator").strip()
ADMIN_EMAIL = os.getenv("SLUDGE_SMART_ADMIN_EMAIL", "").strip()
