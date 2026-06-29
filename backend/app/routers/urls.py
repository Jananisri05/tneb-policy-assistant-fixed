# app/routers/urls.py
"""
Admin-only URL management endpoints.

POST   /urls/          — ingest a new URL
GET    /urls/          — list all ingested URLs
GET    /urls/{id}      — get a single URL entry
DELETE /urls/{id}      — remove URL and its chunks from ChromaDB
POST   /urls/{id}/refresh — re-fetch + re-embed the URL
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Request

from app.models.schemas import (
    UrlAddRequest, UrlAddResponse,
    UrlInfo, UrlListResponse,
    UrlRefreshResponse, DeleteResponse,
)
from app.services.urls_service import get_url_service
from app.routers.auth import get_current_admin
from app.services.auth_service import log_admin_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/urls", tags=["URLs"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/", response_model=UrlAddResponse, status_code=201)
async def add_url(
    payload: UrlAddRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Fetch a URL and ingest its content into ChromaDB. Admin only."""
    session = get_current_admin(authorization)
    url_service = get_url_service()
    ip = _client_ip(request)

    # Basic URL sanity check
    if not payload.url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="URL must start with http:// or https://",
        )

    # Duplicate check
    existing = url_service.list_urls()
    for u in existing:
        if u.url == payload.url:
            raise HTTPException(
                status_code=409,
                detail=f"This URL is already indexed (id={u.id}). Use /urls/{u.id}/refresh to update it.",
            )

    try:
        info = await url_service.ingest_url(
            url=payload.url,
            label=payload.label,
            added_by=session["username"],
            adder_ip=ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    # REPLACE this:

# WITH this:
    except Exception as e:
        import traceback
        logger.error("URL ingestion failed: %s\n%s", repr(e), traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to ingest URL: {repr(e)}")

    log_admin_action(
        session["username"],
        "url_add",
        f"Added URL: {payload.url} as '{info.label}' (id={info.id})",
        ip,
    )
    return UrlAddResponse(url_info=info, message=f"Indexed {info.chunk_count} chunks from URL.")


@router.get("/", response_model=UrlListResponse)
def list_urls(authorization: Optional[str] = Header(None)):
    """List all ingested URLs. Admin only."""
    get_current_admin(authorization)
    url_service = get_url_service()
    urls = url_service.list_urls()
    return UrlListResponse(urls=urls, total=len(urls))


@router.get("/{url_id}", response_model=UrlInfo)
def get_url(url_id: str, authorization: Optional[str] = Header(None)):
    get_current_admin(authorization)
    url_service = get_url_service()
    info = url_service.get_url(url_id)
    if not info:
        raise HTTPException(status_code=404, detail="URL not found")
    return info


@router.delete("/{url_id}", response_model=DeleteResponse)
def delete_url(
    url_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    session = get_current_admin(authorization)
    url_service = get_url_service()

    info = url_service.get_url(url_id)
    if not info:
        raise HTTPException(status_code=404, detail="URL not found")

    success = url_service.delete_url(url_id)
    if not success:
        raise HTTPException(status_code=404, detail="URL not found")

    log_admin_action(
        session["username"],
        "url_delete",
        f"Deleted URL: {info.url} (id={url_id})",
        _client_ip(request),
    )
    return DeleteResponse(message="URL removed successfully", document_id=url_id)


@router.post("/{url_id}/refresh", response_model=UrlRefreshResponse)
async def refresh_url(
    url_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Re-fetch and re-embed the URL content. Admin only."""
    session = get_current_admin(authorization)
    url_service = get_url_service()
    ip = _client_ip(request)

    if not url_service.get_url(url_id):
        raise HTTPException(status_code=404, detail="URL not found")

    try:
        new_info, old_count, new_count = url_service.refresh_url(
            url_id=url_id,
            refreshed_by=session["username"],
            refresher_ip=ip,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("URL refresh failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Refresh failed: {str(e)}")

    log_admin_action(
        session["username"],
        "url_refresh",
        f"Refreshed URL: {new_info.url} (id={url_id}) — {old_count}→{new_count} chunks",
        ip,
    )
    return UrlRefreshResponse(
        url_info=new_info,
        message=f"Re-indexed {new_count} chunks (was {old_count}).",
        old_chunk_count=old_count,
        new_chunk_count=new_count,
    )