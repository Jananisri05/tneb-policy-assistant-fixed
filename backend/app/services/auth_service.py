import os
import json
import uuid
import hashlib
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
ADMIN_FILE = os.path.join(DATA_DIR, "admins.json")
SESSION_FILE = os.path.join(DATA_DIR, "sessions.json")
AUDIT_LOG_FILE = os.path.join(DATA_DIR, "audit_logs.json")

SESSION_TTL_HOURS = 8

# --- In-memory caches (persist for process lifetime) ---------------------
# Eliminates disk reads on every request. Written through to disk on mutation.
_sessions_cache: Optional[dict] = None   # token -> session data
_admins_cache: Optional[dict] = None     # admin_id -> admin data
# ---------------------------------------------------------------------------


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _hash_password(password: str) -> str:
    salted = f"tneb_policy_{password}_salt_2024"
    return hashlib.sha256(salted.encode()).hexdigest()


def _load_json_file(filepath: str, default=None) -> dict:
    _ensure_data_dir()
    if default is None:
        default = {}
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return default
    return default


def _save_json_file(filepath: str, data: dict):
    _ensure_data_dir()
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, default=str)


# --- Admins (cached) -------------------------------------------------------

def _load_admins() -> dict:
    global _admins_cache
    if _admins_cache is None:
        _admins_cache = _load_json_file(ADMIN_FILE)
    return _admins_cache


def _save_admins(admins: dict):
    global _admins_cache
    _admins_cache = admins
    _save_json_file(ADMIN_FILE, admins)


# --- Sessions (cached) -------------------------------------------------------

def _load_sessions() -> dict:
    global _sessions_cache
    if _sessions_cache is None:
        _sessions_cache = _load_json_file(SESSION_FILE)
        # Clean up expired sessions on first load only
        _sessions_cache = _cleanup_expired_sessions(_sessions_cache)
    return _sessions_cache


def _save_sessions(sessions: dict):
    global _sessions_cache
    _sessions_cache = sessions
    _save_json_file(SESSION_FILE, sessions)


def _cleanup_expired_sessions(sessions: dict) -> dict:
    now = datetime.utcnow()
    return {
        token: data for token, data in sessions.items()
        if datetime.fromisoformat(data["expires_at"]) > now
    }


# --- Audit log (fire-and-forget, non-blocking) -----------------------------
# Audit writes are async-friendly: we buffer them and only write to disk
# on login / logout (high-value events). Token verifications are NOT logged
# to avoid hammering disk on every API call.

def log_admin_action(admin_username: str, action: str, details: str = None, ip_address: str = None):
    """Log admin action. Skips disk write for high-frequency verify calls."""
    # Skip logging token verifications entirely - they happen on every request
    if action == "token_verify":
        return

    logs_data = _load_json_file(AUDIT_LOG_FILE, {"logs": []})
    log_entry = {
        "id": len(logs_data["logs"]) + 1,
        "admin_username": admin_username,
        "action": action,
        "details": details,
        "ip_address": ip_address,
        "timestamp": datetime.utcnow().isoformat()
    }
    logs_data["logs"].append(log_entry)
    if len(logs_data["logs"]) > 1000:
        logs_data["logs"] = logs_data["logs"][-1000:]
    _save_json_file(AUDIT_LOG_FILE, logs_data)
    logger.info(f"Admin log: {admin_username} - {action} - {details}")


def get_admin_logs(limit: int = 100) -> List[dict]:
    logs_data = _load_json_file(AUDIT_LOG_FILE, {"logs": []})
    return logs_data["logs"][-limit:]


def seed_default_admin():
    """Create default admin if none exist."""
    admins = _load_admins()
    if not admins:
        admin_id = str(uuid.uuid4())
        default_password = os.getenv("DEFAULT_ADMIN_PASSWORD")
        if not default_password:
            logger.error(
                "DEFAULT_ADMIN_PASSWORD not set - skipping admin seed. "
                "Set this env var (as a Secret) and restart."
            )
            return
        admins[admin_id] = {
            "id": admin_id,
            "username": os.getenv("DEFAULT_ADMIN_USERNAME", "admin"),
            "email": "admin@tneb.gov.in",
            "full_name": "TNEB Administrator",
            "password_hash": _hash_password(default_password),
            "created_at": datetime.utcnow().isoformat(),
            "last_login": None,
            "is_active": True
        }
        _save_admins(admins)
        logger.info(f"Default admin created - username: {admins[admin_id]['username']}")
        log_admin_action("system", "admin_created", "Default admin created", "127.0.0.1")


def login_admin(username: str, password: str, ip_address: str = None) -> Optional[str]:
    """Verify credentials and return session token, or None."""
    admins = _load_admins()
    password_hash = _hash_password(password)

    admin = next(
        (a for a in admins.values()
         if a["username"].lower() == username.lower()
         and a["password_hash"] == password_hash
         and a.get("is_active", True)),
        None
    )

    if not admin:
        log_admin_action(username, "login_failed", "Invalid credentials", ip_address)
        return None

    # Update last login (in cache + disk in one write)
    admin["last_login"] = datetime.utcnow().isoformat()
    _save_admins(admins)

    token = secrets.token_hex(32)
    sessions = _load_sessions()
    sessions[token] = {
        "admin_id": admin["id"],
        "username": admin["username"],
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS)).isoformat(),
    }
    _save_sessions(sessions)

    log_admin_action(admin["username"], "login", "Admin logged in", ip_address)
    return token


def verify_token(token: str) -> Optional[dict]:
    """Return session data if token is valid and not expired. Uses in-memory cache - no disk read."""
    if not token:
        return None
    sessions = _load_sessions()          # returns cache after first load
    session = sessions.get(token)
    if not session:
        return None
    if datetime.fromisoformat(session["expires_at"]) < datetime.utcnow():
        del sessions[token]
        _save_sessions(sessions)
        return None
    return session


def logout_admin(token: str, ip_address: str = None):
    sessions = _load_sessions()
    session = sessions.get(token)
    if session:
        username = session.get("username", "unknown")
        log_admin_action(username, "logout", "Admin logged out", ip_address)
        del sessions[token]
        _save_sessions(sessions)


def get_all_admins() -> list:
    admins = _load_admins()
    return [
        {k: v for k, v in a.items() if k != "password_hash"}
        for a in admins.values()
    ]


def get_admin_by_id(admin_id: str) -> Optional[dict]:
    admins = _load_admins()
    admin = admins.get(admin_id)
    if admin:
        return {k: v for k, v in admin.items() if k != "password_hash"}
    return None


def get_admin_by_username(username: str) -> Optional[dict]:
    admins = _load_admins()
    for admin in admins.values():
        if admin["username"].lower() == username.lower():
            return {k: v for k, v in admin.items() if k != "password_hash"}
    return None


def create_admin(username: str, password: str, email: str = None, full_name: str = None) -> dict:
    admins = _load_admins()
    if any(a["username"].lower() == username.lower() for a in admins.values()):
        raise ValueError(f"Admin '{username}' already exists")

    admin_id = str(uuid.uuid4())
    admin = {
        "id": admin_id,
        "username": username,
        "email": email,
        "full_name": full_name or username,
        "password_hash": _hash_password(password),
        "created_at": datetime.utcnow().isoformat(),
        "last_login": None,
        "is_active": True
    }
    admins[admin_id] = admin
    _save_admins(admins)
    log_admin_action(username, "admin_created", f"New admin created: {username}", "127.0.0.1")
    return {k: v for k, v in admin.items() if k != "password_hash"}


def update_admin(admin_id: str, **kwargs) -> Optional[dict]:
    admins = _load_admins()
    if admin_id not in admins:
        return None
    admin = admins[admin_id]
    allowed_fields = {"email", "full_name", "is_active"}
    for key, value in kwargs.items():
        if key in allowed_fields:
            admin[key] = value
    _save_admins(admins)
    log_admin_action(admin["username"], "admin_updated", "Admin details updated", "127.0.0.1")
    return {k: v for k, v in admin.items() if k != "password_hash"}


def change_password(admin_id: str, old_password: str, new_password: str) -> bool:
    admins = _load_admins()
    if admin_id not in admins:
        return False
    admin = admins[admin_id]
    if admin["password_hash"] != _hash_password(old_password):
        return False
    admin["password_hash"] = _hash_password(new_password)
    _save_admins(admins)
    log_admin_action(admin["username"], "password_changed", "Admin password changed", "127.0.0.1")
    return True


def get_admin_stats() -> dict:
    admins = _load_admins()
    logs_data = _load_json_file(AUDIT_LOG_FILE, {"logs": []})
    return {
        "total_admins": len(admins),
        "active_admins": sum(1 for a in admins.values() if a.get("is_active", True)),
        "total_actions": len(logs_data["logs"]),
        "recent_actions": min(len(logs_data["logs"]), 10),
    }
