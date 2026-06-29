# app/routers/query.py

import logging
from fastapi import APIRouter, HTTPException, Depends

from app.models.schemas import (
    QueryRequest, QueryResponse,
    SummarizeRequest, SummarizeResponse,
)
from app.services import rag_service
from app.services.document_service import get_document_service, DocumentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query", tags=["Query"])


@router.post("/", response_model=QueryResponse)
async def query_documents(
    request: QueryRequest,
    doc_service: DocumentService = Depends(get_document_service),
):
    """
    Ask a question, search, or run QA against policy documents.
    Modes: 'qa' (default), 'search'
    """
    if doc_service.collection_count() == 0:
        raise HTTPException(
            status_code=400,
            detail="No documents indexed yet. Please upload policy documents first.",
        )

    try:
        result = await rag_service.answer_query(
            query=request.query,
            mode=request.mode,
            document_ids=request.document_ids,
            conversation_history=request.conversation_history,
        )
        return result
    except Exception as e:
        logger.error("Query failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_document(
    request: SummarizeRequest,
    doc_service: DocumentService = Depends(get_document_service),
):
    """
    Summarize a specific policy document.
    Summary types: 'brief', 'detailed', 'bullets'
    """
    try:
        result = await rag_service.summarize_document(
            document_id=request.document_id,
            summary_type=request.summary_type,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Summarization failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")