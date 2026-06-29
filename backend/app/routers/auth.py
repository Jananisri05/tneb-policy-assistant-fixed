import logging
from fastapi import APIRouter, HTTPException, Header, Request
from typing import Optional

from app.models.schemas import AdminLoginRequest, AdminLoginResponse, AdminInfo, AdminLogsResponse, AdminLogEntry
from app.services import auth_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Auth"])


def get_current_admin(authorization: Optional[str] = Header(None)) -> dict:
    """Dependency — extracts and validates Bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    session = auth_service.verify_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return session

# app/routers/auth.py
@router.post("/login", response_model=AdminLoginResponse)
def login(request: AdminLoginRequest, req: Request):
    """Admin login endpoint"""
    client_ip = req.client.host if req.client else "unknown"
    forwarded = req.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    
    token = auth_service.login_admin(request.username, request.password, client_ip)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    print(f"Login successful - Token generated: {token[:20]}...")  # Debug
    
    return AdminLoginResponse(
        token=token,
        username=request.username,
        role="admin",
        message="Login successful",
    )

@router.post("/logout")
def logout(
    req: Request,
    authorization: Optional[str] = Header(None)
):
    """Admin logout endpoint"""
    client_ip = req.client.host if req.client else "unknown"
    forwarded = req.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        auth_service.logout_admin(token, client_ip)
    return {"message": "Logged out successfully"}


@router.get("/me")
def me(authorization: Optional[str] = Header(None)):
    """Get current admin info"""
    session = get_current_admin(authorization)
    admin_info = auth_service.get_admin_by_username(session["username"])
    if not admin_info:
        raise HTTPException(status_code=404, detail="Admin not found")
    return admin_info


@router.get("/admins", response_model=list)
def list_admins(authorization: Optional[str] = Header(None)):
    """List all admins (admin only)"""
    get_current_admin(authorization)
    return auth_service.get_all_admins()


@router.get("/admins/{admin_id}", response_model=AdminInfo)
def get_admin(
    admin_id: str,
    authorization: Optional[str] = Header(None)
):
    """Get specific admin details (admin only)"""
    get_current_admin(authorization)
    admin = auth_service.get_admin_by_id(admin_id)
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    return admin


@router.post("/admins", response_model=AdminInfo)
def create_admin(
    payload: dict,
    authorization: Optional[str] = Header(None),
):
    """Create new admin (admin only)"""
    get_current_admin(authorization)
    try:
        admin = auth_service.create_admin(
            username=payload["username"],
            password=payload["password"],
            email=payload.get("email"),
            full_name=payload.get("full_name"),
        )
        return admin
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/admins/{admin_id}")
def update_admin(
    admin_id: str,
    payload: dict,
    authorization: Optional[str] = Header(None),
):
    """Update admin details (admin only)"""
    get_current_admin(authorization)
    admin = auth_service.update_admin(admin_id, **payload)
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    return admin


@router.post("/admins/{admin_id}/change-password")
def change_password(
    admin_id: str,
    payload: dict,
    authorization: Optional[str] = Header(None),
):
    """Change admin password (admin only)"""
    get_current_admin(authorization)
    success = auth_service.change_password(
        admin_id,
        payload.get("old_password"),
        payload.get("new_password")
    )
    if not success:
        raise HTTPException(status_code=400, detail="Password change failed")
    return {"message": "Password changed successfully"}


@router.get("/logs", response_model=AdminLogsResponse)
def get_admin_logs(
    limit: int = 100,
    authorization: Optional[str] = Header(None),
):
    """Get admin audit logs (admin only)"""
    get_current_admin(authorization)
    logs = auth_service.get_admin_logs(limit)
    return AdminLogsResponse(
        logs=[AdminLogEntry(**log) for log in logs],
        total=len(logs)
    )


@router.get("/stats")
def get_admin_stats(authorization: Optional[str] = Header(None)):
    """Get admin statistics (admin only)"""
    get_current_admin(authorization)
    return auth_service.get_admin_stats()