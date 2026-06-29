# app/routers/admin_routes.py

from fastapi import APIRouter, HTTPException, Header, Request, Query
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

from app.routers.auth import get_current_admin
from app.services import auth_service
from app.services.auth_service import log_admin_action

# Pydantic models for admin routes
class AdminUpdateRequest(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None

class AdminCreateRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    full_name: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

router = APIRouter(prefix="/admin", tags=["Admin Management"])


def _get_client_ip(request: Request) -> str:
    """Helper to extract client IP from request"""
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    return client_ip


@router.get("/logs")
def get_admin_logs(
    request: Request,
    limit: int = Query(100, ge=1, le=500, description="Number of logs to retrieve"),
    skip: int = Query(0, ge=0, description="Number of logs to skip"),
    authorization: Optional[str] = Header(None),
):
    """Get admin audit logs. Requires admin authentication."""
    session = get_current_admin(authorization)
    all_logs = auth_service.get_admin_logs(limit + skip)
    paginated_logs = all_logs[skip:skip + limit]
    
    return {
        "logs": paginated_logs,
        "total": len(all_logs),
        "skip": skip,
        "limit": limit
    }


@router.get("/stats")
def get_admin_stats(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Get admin statistics and dashboard data."""
    session = get_current_admin(authorization)
    stats = auth_service.get_admin_stats()
    
    # Get recent activity
    logs = auth_service.get_admin_logs(20)
    
    # Get active sessions count
    sessions = auth_service._load_sessions()
    active_sessions = len(sessions)
    
    # Get admin details
    current_admin = auth_service.get_admin_by_username(session["username"])
    
    return {
        "stats": stats,
        "active_sessions": active_sessions,
        "recent_activity": logs[:10],
        "current_admin": current_admin,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/sessions")
def get_active_sessions(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Get all active admin sessions."""
    session = get_current_admin(authorization)
    sessions = auth_service._load_sessions()
    active_sessions = []
    
    now = datetime.utcnow()
    for token, session_data in sessions.items():
        expires_at = datetime.fromisoformat(session_data["expires_at"])
        if expires_at > now:
            admin_info = auth_service.get_admin_by_id(session_data["admin_id"])
            active_sessions.append({
                "token_preview": token[:8] + "...",
                "admin_username": session_data["username"],
                "admin_id": session_data["admin_id"],
                "created_at": session_data["created_at"],
                "expires_at": session_data["expires_at"],
                "is_expired": False
            })
    
    return {
        "active_sessions": len(active_sessions),
        "sessions": active_sessions
    }


@router.get("/admins")
def list_all_admins(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """List all admin users."""
    session = get_current_admin(authorization)
    admins = auth_service.get_all_admins()
    return {
        "admins": admins,
        "total": len(admins)
    }


@router.get("/admins/{admin_id}")
def get_admin_details(
    admin_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Get detailed information about a specific admin."""
    session = get_current_admin(authorization)
    admin = auth_service.get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    logs = auth_service.get_admin_logs(100)
    admin_logs = [log for log in logs if log.get("admin_username") == admin["username"]]
    
    return {
        "admin": admin,
        "stats": {
            "total_actions": len(admin_logs),
            "last_login": admin.get("last_login"),
            "created_at": admin.get("created_at"),
            "is_active": admin.get("is_active", True)
        }
    }


@router.post("/admins")
def create_new_admin(
    payload: AdminCreateRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Create a new admin user."""
    session = get_current_admin(authorization)
    client_ip = _get_client_ip(request)
    
    try:
        admin = auth_service.create_admin(
            username=payload.username,
            password=payload.password,
            email=payload.email,
            full_name=payload.full_name,
        )
        
        log_admin_action(
            session["username"],
            "admin_created",
            f"Created new admin: {payload.username}",
            client_ip
        )
        
        return {
            "message": f"Admin '{payload.username}' created successfully",
            "admin": admin
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/admins/{admin_id}")
def update_admin_details(
    admin_id: str,
    payload: AdminUpdateRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Update admin details."""
    session = get_current_admin(authorization)
    client_ip = _get_client_ip(request)
    
    admin_info = auth_service.get_admin_by_id(admin_id)
    if not admin_info:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    if admin_info["username"] == session["username"] and payload.is_active is False:
        raise HTTPException(
            status_code=400,
            detail="You cannot deactivate your own account"
        )
    
    updated_admin = auth_service.update_admin(
        admin_id,
        **payload.dict(exclude_none=True)
    )
    
    if not updated_admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    log_admin_action(
        session["username"],
        "admin_updated",
        f"Updated admin: {admin_info['username']}",
        client_ip
    )
    
    return {
        "message": f"Admin '{admin_info['username']}' updated successfully",
        "admin": updated_admin
    }


@router.post("/admins/{admin_id}/change-password")
def change_admin_password(
    admin_id: str,
    payload: PasswordChangeRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Change admin password."""
    session = get_current_admin(authorization)
    client_ip = _get_client_ip(request)
    
    admin_info = auth_service.get_admin_by_id(admin_id)
    if not admin_info:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    is_own_account = admin_info["username"] == session["username"]
    
    if is_own_account:
        success = auth_service.change_password(
            admin_id,
            payload.old_password,
            payload.new_password
        )
        if not success:
            raise HTTPException(status_code=400, detail="Old password is incorrect")
    else:
        # Force change without old password
        admins = auth_service._load_admins()
        if admin_id not in admins:
            raise HTTPException(status_code=404, detail="Admin not found")
        
        admin = admins[admin_id]
        admin["password_hash"] = auth_service._hash_password(payload.new_password)
        auth_service._save_admins(admins)
        
        log_admin_action(
            session["username"],
            "password_force_changed",
            f"Forced password change for admin: {admin_info['username']}",
            client_ip
        )
        
        return {
            "message": f"Password for '{admin_info['username']}' changed successfully (forced by {session['username']})"
        }
    
    log_admin_action(
        session["username"],
        "password_changed",
        "Changed own password",
        client_ip
    )
    
    return {"message": "Password changed successfully"}


@router.delete("/admins/{admin_id}")
def delete_admin(
    admin_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Delete/deactivate an admin user."""
    session = get_current_admin(authorization)
    client_ip = _get_client_ip(request)
    
    admin_info = auth_service.get_admin_by_id(admin_id)
    if not admin_info:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    if admin_info["username"] == session["username"]:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account"
        )
    
    updated_admin = auth_service.update_admin(
        admin_id,
        is_active=False
    )
    
    log_admin_action(
        session["username"],
        "admin_deleted",
        f"Deactivated admin: {admin_info['username']}",
        client_ip
    )
    
    return {
        "message": f"Admin '{admin_info['username']}' has been deactivated",
        "admin": updated_admin
    }


@router.get("/dashboard")
def get_admin_dashboard(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Get comprehensive admin dashboard data."""
    session = get_current_admin(authorization)
    
    all_logs = auth_service.get_admin_logs(500)
    
    today = datetime.utcnow().date()
    today_logs = [log for log in all_logs 
                 if datetime.fromisoformat(log["timestamp"]).date() == today]
    
    action_counts = {}
    for log in all_logs:
        action = log.get("action", "unknown")
        action_counts[action] = action_counts.get(action, 0) + 1
    
    admin_stats = auth_service.get_admin_stats()
    
    return {
        "dashboard": {
            "total_admins": admin_stats["total_admins"],
            "active_admins": admin_stats["active_admins"],
            "total_actions": admin_stats["total_actions"],
            "today_actions": len(today_logs),
            "action_breakdown": action_counts,
            "recent_activities": all_logs[:20],
            "timestamp": datetime.utcnow().isoformat()
        }
    }