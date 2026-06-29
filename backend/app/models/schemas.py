from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional
from datetime import datetime


class DocumentInfo(BaseModel):
    id: str
    filename: str
    original_name: str
    size_bytes: int
    chunk_count: int
    uploaded_at: datetime
    doc_type: str = "policy"
    uploaded_by: Optional[str] = None
    uploader_ip: Optional[str] = None


class DocumentListResponse(BaseModel):
    documents: List[DocumentInfo]
    total: int


class SourceChunk(BaseModel):
    document_name: str
    chunk_text: str
    page_number: Optional[int] = None
    chunk_index: int
    relevance_score: float


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    document_ids: Optional[List[str]] = None
    mode: str = Field(default="qa", pattern="^(qa|search|summarize)$")
    conversation_history: Optional[List[dict]] = []


class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceChunk]
    query: str
    mode: str
    tokens_used: Optional[int] = None


class SummarizeRequest(BaseModel):
    document_id: str
    summary_type: str = Field(default="brief", pattern="^(brief|detailed|bullets)$")


class SummarizeResponse(BaseModel):
    document_name: str
    summary: str
    summary_type: str
    chunks_processed: int


class DeleteResponse(BaseModel):
    message: str
    document_id: str


class HealthResponse(BaseModel):
    status: str
    documents_indexed: int
    vector_db: str
    embedding_model: str
    llm_model: str


# Auth schemas
class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    username: str
    role: str = "admin"
    message: str


class AdminInfo(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True


# Admin Log schemas
class AdminLogEntry(BaseModel):
    id: int
    admin_username: str
    action: str
    details: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: datetime


class AdminLogsResponse(BaseModel):
    logs: List[AdminLogEntry]
    total: int


# ── URL ingestion schemas ──────────────────────────────────────────────────────

class UrlAddRequest(BaseModel):
    """Admin submits a URL to be fetched, chunked, and embedded."""
    url: str = Field(..., description="The web URL to ingest as a policy source")
    label: Optional[str] = Field(
        None,
        max_length=120,
        description="Human-readable label shown in the sidebar (defaults to page title or URL)",
    )


class UrlInfo(BaseModel):
    """Stored metadata for an ingested URL — mirrors DocumentInfo so the frontend can treat them uniformly."""
    id: str
    url: str
    label: str                    # display name (page title or admin-supplied)
    chunk_count: int
    ingested_at: datetime
    last_refreshed_at: Optional[datetime] = None
    doc_type: str = "url"
    added_by: Optional[str] = None
    adder_ip: Optional[str] = None

    # These mirror DocumentInfo so Sidebar/useDocs can handle both types without branching
    @property
    def original_name(self) -> str:
        return self.label

    @property
    def size_bytes(self) -> int:
        return 0

    @property
    def uploaded_at(self) -> datetime:
        return self.ingested_at

    @property
    def uploaded_by(self) -> Optional[str]:
        return self.added_by


class UrlAddResponse(BaseModel):
    url_info: UrlInfo
    message: str


class UrlRefreshResponse(BaseModel):
    url_info: UrlInfo
    message: str
    old_chunk_count: int
    new_chunk_count: int


class UrlListResponse(BaseModel):
    urls: List[UrlInfo]
    total: int
class URLIngestRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2000)
    title: Optional[str] = None