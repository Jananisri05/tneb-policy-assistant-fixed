# app/main.py

import os
import asyncio
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Windows fix
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from app.config import settings
from app.routers import documents, query, auth
from app.routers import urls as urls_router
from app.routers.admin_routes import router as admin_routes
from app.models.schemas import HealthResponse
from app.services.document_service import get_document_service
from app.services.auth_service import seed_default_admin

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s")
logger = logging.getLogger(__name__)


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int = 100 * 1024 * 1024):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_bytes:
            return Response(
                content=f"Request body too large (max {self.max_bytes // (1024*1024)}MB)",
                status_code=413,
            )
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 50)
    logger.info("Starting TNEB PolicyAI backend...")
    logger.info("=" * 50)
    try:
        seed_default_admin()
        logger.info("✓ Default admin seeded")
        logger.info("⏳ Initializing document service...")
        get_document_service()
        logger.info("✓ Document service initialized")
        logger.info("✓ Backend ready!")
        yield
    except Exception as e:
        logger.error(f"✗ Startup error: {e}")
        raise
    finally:
        logger.info("Shutting down...")


app = FastAPI(
    title="TNEB PolicyAI API",
    version="1.0.0",
    description="TNEB Policy Knowledge Assistant",
    lifespan=lifespan,
    redirect_slashes=False,  # add this
)

# Middleware — order matters: MaxBodySize must be before CORS
app.add_middleware(MaxBodySizeMiddleware, max_bytes=100 * 1024 * 1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5174",
        "https://frontend-self-ten-83.vercel.app",
        "https://tneb-policy-assistant-fixed-esu8.vercel.app",
        "https://jananisri-tneb-policyai.hf.space",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",  # covers ALL vercel preview URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(query.router, prefix="/api/v1")
app.include_router(urls_router.router, prefix="/api/v1")
app.include_router(admin_routes, prefix="/api/v1")


@app.get("/api/v1/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    try:
        svc = get_document_service()
        return HealthResponse(
            status="ok",
            documents_indexed=len(svc.list_documents()),
            vector_db="ChromaDB",
            embedding_model=settings.EMBED_MODEL,
            llm_model=settings.GROQ_MODEL,
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="error",
            documents_indexed=0,
            vector_db="ChromaDB",
            embedding_model=settings.EMBED_MODEL,
            llm_model=settings.GROQ_MODEL,
        )
from fastapi.staticfiles import StaticFiles
import os

# Serve React frontend
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")

@app.get("/")
def root():
    return {
        "message": "TNEB PolicyAI API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=True,        # auto-restart on code changes
        log_level="info",
        http="httptools",
        timeout_keep_alive=600,
    )