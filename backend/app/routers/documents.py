# app/routers/documents.py

import os
import uuid
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Header, Request
import aiofiles

from app.config import settings
from app.models.schemas import DocumentInfo, DocumentListResponse, DeleteResponse, URLIngestRequest
from app.services.document_service import get_document_service
from app.routers.auth import get_current_admin
from app.services.auth_service import log_admin_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}


def validate_file(file: UploadFile) -> None:
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )


@router.get("/recent", response_model=DocumentListResponse)
def get_recent_documents():
    doc_service = get_document_service()
    docs = doc_service.get_recent_documents(hours=24)
    return DocumentListResponse(documents=docs, total=len(docs))


@router.post("/upload", response_model=DocumentInfo, status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    try:
        session = get_current_admin(authorization)
    except HTTPException as e:
        logger.error(f"Authentication failed: {e.detail}")
        raise

    doc_service = get_document_service()
    validate_file(file)

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f}MB). Max: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    ext = Path(file.filename).suffix.lower()
    safe_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    try:
        doc_info = doc_service.ingest_document(
            file_path=file_path,
            original_name=file.filename,
            uploaded_by=session["username"],
            uploader_ip=client_ip,
        )
        log_admin_action(
            session["username"],
            "document_upload",
            f"Uploaded document: {file.filename} (ID: {doc_info.id})",
            client_ip,
        )
        return doc_info
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.error(f"Ingestion failed for {file.filename}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@router.get("/", response_model=DocumentListResponse)
def list_documents(authorization: Optional[str] = Header(None)):
    try:
        get_current_admin(authorization)
    except HTTPException as e:
        logger.error(f"Authentication failed for list: {e.detail}")
        raise
    doc_service = get_document_service()
    docs = doc_service.list_documents()
    return DocumentListResponse(documents=docs, total=len(docs))


@router.get("/{document_id}", response_model=DocumentInfo)
def get_document(document_id: str, authorization: Optional[str] = Header(None)):
    get_current_admin(authorization)
    doc_service = get_document_service()
    doc = doc_service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.delete("/{document_id}", response_model=DeleteResponse)
def delete_document(
    document_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    session = get_current_admin(authorization)
    doc_service = get_document_service()

    doc_info = doc_service.get_document(document_id)
    if not doc_info:
        raise HTTPException(status_code=404, detail="Document not found")

    success = doc_service.delete_document(document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")

    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    log_admin_action(
        session["username"],
        "document_delete",
        f"Deleted document: {doc_info.original_name} (ID: {document_id})",
        client_ip,
    )
    return DeleteResponse(message="Document deleted successfully", document_id=document_id)


@router.post("/url", response_model=DocumentInfo, status_code=201)
def ingest_url(
    payload: URLIngestRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    session = get_current_admin(authorization)
    doc_service = get_document_service()

    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    try:
        doc_info = doc_service.ingest_url(
            url=payload.url,
            title=payload.title,
            uploaded_by=session["username"],
            uploader_ip=client_ip,
        )
        log_admin_action(
            session["username"],
            "url_ingest",
            f"Ingested URL: {payload.url} (ID: {doc_info.id})",
            client_ip,
        )
        return doc_info
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"URL ingestion failed: {str(e)}")


@router.post("/{document_id}/refresh", response_model=DocumentInfo)
def refresh_url_document(
    document_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    session = get_current_admin(authorization)
    doc_service = get_document_service()

    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    try:
        doc_info = doc_service.refresh_url_document(document_id)
        log_admin_action(
            session["username"],
            "url_refresh",
            f"Refreshed URL document ID: {document_id}",
            client_ip,
        )
        return doc_info
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Refresh failed: {str(e)}")