# app/services/url_service.py
"""
URL ingestion service — supports:
  1. JS-rendered HTML pages  → Playwright (headless Chromium)
  2. PDF URLs                → httpx download + existing DocumentService PDF extractor
                               (includes Groq vision fallback for scanned PDFs)

Install once:
    pip install playwright httpx
    playwright install chromium --with-deps
"""

import os
import uuid
import json
import logging
import re
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings
from app.models.schemas import UrlInfo

logger = logging.getLogger(__name__)

URL_METADATA_FILE = os.path.join(settings.UPLOAD_DIR, "url_metadata.json")
MAX_TEXT_CHARS = 500_000


# ── helpers ───────────────────────────────────────────────────────────────────

def _sniff_pdf(url: str) -> bool:
    """
    Return True if the URL points to a PDF.
    First checks the path extension; if ambiguous, sends a HEAD request.
    """
    if urlparse(url).path.lower().endswith(".pdf"):
        return True
    try:
        with httpx.Client(follow_redirects=True, timeout=10) as client:
            r = client.head(url)
            return "application/pdf" in r.headers.get("content-type", "")
    except Exception:
        return False


def _download_pdf(url: str) -> str:
    """
    Download a PDF from a URL into a temp file.
    Returns the temp file path (caller must delete it).
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    with httpx.Client(follow_redirects=True, timeout=60) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()

    suffix = ".pdf"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(r.content)
    tmp.close()
    logger.info("Downloaded PDF (%d KB) from %s", len(r.content) // 1024, url)
    return tmp.name


def _fetch_rendered_html_sync(url: str) -> tuple[str, str]:
    """
    SYNC version - runs in a thread pool to avoid Windows asyncio issues.
    Launch headless Chromium via Playwright (sync), wait for network idle,
    return (page_title, full_rendered_html).
    Works for JS-SPAs, government portals, any public page.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )
        page = context.new_page()
        try:
            page.goto(url, wait_until="networkidle", timeout=45000)
        except PWTimeout:
            logger.warning("networkidle timeout for %s — using partial render", url)
        try:
            page.wait_for_timeout(2000)
        except Exception:
            pass

        title = page.title() or ""
        html = page.content()
        browser.close()

    return title, html


async def _fetch_rendered_html(url: str) -> tuple[str, str]:
    """
    Async wrapper that runs the sync Playwright code in a thread pool.
    This avoids the NotImplementedError on Windows with asyncio subprocess.
    """
    loop = asyncio.get_running_loop()
    # Create a partial function with the URL
    func = partial(_fetch_rendered_html_sync, url)
    
    # Run in thread pool executor
    with ThreadPoolExecutor(max_workers=4) as executor:
        result = await loop.run_in_executor(executor, func)
        return result


def _html_to_text(html: str, fallback_title: str = "") -> tuple[str, str]:
    """Strip boilerplate from rendered HTML, return (title, clean_body_text)."""
    soup = BeautifulSoup(html, "html.parser")

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else fallback_title

    for tag in soup(["script", "style", "nav", "header", "footer",
                      "aside", "form", "noscript", "iframe", "svg",
                      "button", "figure"]):
        tag.decompose()

    main = (
        soup.find("main") or
        soup.find("article") or
        soup.find(id=re.compile(r"content|main|body", re.I)) or
        soup.find(class_=re.compile(r"content|main|body", re.I))
    )
    root = main if main else soup.find("body") or soup

    text = root.get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = text.strip()

    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]
        logger.warning("HTML text truncated to %d chars", MAX_TEXT_CHARS)

    return title.strip(), text


# ── service class ─────────────────────────────────────────────────────────────

class UrlService:
    def __init__(self, document_service):
        self._ds = document_service          # DocumentService instance
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
        )
        self._metadata: dict = self._load_metadata()

    # ── persistence ───────────────────────────────────────────────────────────

    def _load_metadata(self) -> dict:
        if os.path.exists(URL_METADATA_FILE):
            with open(URL_METADATA_FILE, "r") as f:
                return json.load(f)
        return {}

    def _save_metadata(self):
        with open(URL_METADATA_FILE, "w") as f:
            json.dump(self._metadata, f, indent=2, default=str)

    # ── fetch + extract ───────────────────────────────────────────────────────

    async def _get_text_from_url(self, url: str) -> tuple[str, str]:
        """
        Route to the right extractor based on content type.

        PDF URL  → download → reuse DocumentService._extract_text_pdf()
                               (handles scanned pages via Groq vision too)
        HTML URL → Playwright render → BeautifulSoup strip

        Returns (display_label, body_text).
        """
        if _sniff_pdf(url):
            logger.info("Detected PDF URL: %s", url)
            tmp_path = _download_pdf(url)
            try:
                pages = self._ds._extract_text_pdf(tmp_path)
                body_text = "\n\n".join(text for text, _ in pages)
                # Use the filename part of the URL as label
                label = urlparse(url).path.split("/")[-1] or url
            finally:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

            if not body_text or len(body_text) < 50:
                raise ValueError(
                    f"Could not extract text from PDF at {url}. "
                    "The file may be corrupted or image-only without OCR support."
                )
            return label, body_text

        else:
            logger.info("Detected HTML URL: %s", url)
            page_title, html = await _fetch_rendered_html(url)
            label, body_text = _html_to_text(html, fallback_title=page_title)

            if not body_text or len(body_text) < 50:
                raise ValueError(
                    f"Could not extract meaningful text from {url}. "
                    "The page may require authentication or be completely empty."
                )
            return label or urlparse(url).netloc or url, body_text

    # ── ingest ────────────────────────────────────────────────────────────────

    async def ingest_url(
        self,
        url: str,
        label: Optional[str],
        added_by: str = "admin",
        adder_ip: str = "unknown",
        existing_id: Optional[str] = None,
    ) -> UrlInfo:
        auto_label, body_text = await self._get_text_from_url(url)
        display_label = label or auto_label
        doc_id = existing_id or str(uuid.uuid4())

        # Delete old chunks on refresh
        if existing_id:
            try:
                self._ds.collection.delete(where={"doc_id": existing_id})
                logger.info("Deleted old chunks for URL id=%s", existing_id)
            except Exception as e:
                logger.warning("Could not delete old URL chunks: %s", e)

        raw_chunks = self._splitter.split_text(body_text)
        if not raw_chunks:
            raise ValueError("No text chunks produced from URL content.")

        embeddings = self._ds.embedder.encode(raw_chunks, show_progress_bar=False).tolist()
        ids = [f"{doc_id}_{i}" for i in range(len(raw_chunks))]
        metadatas = [
            {
                "doc_id": doc_id,
                "document_name": display_label,
                "source_url": url,
                "doc_type": "url",
                "page_number": 1,
                "chunk_index": i,
            }
            for i in range(len(raw_chunks))
        ]

        batch_size = 100
        for i in range(0, len(ids), batch_size):
            self._ds.collection.upsert(
                ids=ids[i:i + batch_size],
                embeddings=embeddings[i:i + batch_size],
                documents=raw_chunks[i:i + batch_size],
                metadatas=metadatas[i:i + batch_size],
            )

        now = datetime.utcnow()
        stored_ingested_at = (
            self._metadata[doc_id]["ingested_at"]
            if existing_id and doc_id in self._metadata
            else now.isoformat()
        )

        info = UrlInfo(
            id=doc_id,
            url=url,
            label=display_label,
            chunk_count=len(raw_chunks),
            ingested_at=stored_ingested_at,
            last_refreshed_at=now if existing_id else None,
            doc_type="url",
            added_by=added_by,
            adder_ip=adder_ip,
        )

        self._metadata[doc_id] = {
            "id": doc_id,
            "url": url,
            "label": display_label,
            "chunk_count": len(raw_chunks),
            "ingested_at": stored_ingested_at,
            "last_refreshed_at": now.isoformat() if existing_id else None,
            "doc_type": "url",
            "added_by": added_by,
            "adder_ip": adder_ip,
        }
        self._save_metadata()
        logger.info("Ingested %d chunks from %s (id=%s)", len(raw_chunks), url, doc_id)
        return info

    # ── refresh ───────────────────────────────────────────────────────────────

    async def refresh_url(
        self,
        url_id: str,
        refreshed_by: str = "admin",
        refresher_ip: str = "unknown",
    ) -> tuple[UrlInfo, int, int]:
        if url_id not in self._metadata:
            raise ValueError(f"URL id '{url_id}' not found.")
        entry = self._metadata[url_id]
        old_count = entry.get("chunk_count", 0)
        new_info = await self.ingest_url(
            url=entry["url"],
            label=entry["label"],
            added_by=refreshed_by,
            adder_ip=refresher_ip,
            existing_id=url_id,
        )
        return new_info, old_count, new_info.chunk_count

    # ── list / get / delete ───────────────────────────────────────────────────

    def list_urls(self) -> list[UrlInfo]:
        urls = []
        for v in self._metadata.values():
            try:
                ingested_at = v.get("ingested_at", datetime.utcnow().isoformat())
                if isinstance(ingested_at, str):
                    ingested_at = datetime.fromisoformat(ingested_at.replace("Z", ""))
                last_refreshed = v.get("last_refreshed_at")
                if isinstance(last_refreshed, str):
                    last_refreshed = datetime.fromisoformat(last_refreshed.replace("Z", ""))
                urls.append(UrlInfo(
                    id=v["id"], url=v["url"],
                    label=v.get("label", v["url"]),
                    chunk_count=v.get("chunk_count", 0),
                    ingested_at=ingested_at,
                    last_refreshed_at=last_refreshed,
                    doc_type="url",
                    added_by=v.get("added_by"),
                    adder_ip=v.get("adder_ip"),
                ))
            except Exception as e:
                logger.warning("Error parsing URL metadata: %s", e)
        return urls

    def get_url(self, url_id: str) -> Optional[UrlInfo]:
        for u in self.list_urls():
            if u.id == url_id:
                return u
        return None

    def delete_url(self, url_id: str) -> bool:
        if url_id not in self._metadata:
            return False
        try:
            self._ds.collection.delete(where={"doc_id": url_id})
        except Exception as e:
            logger.warning("ChromaDB delete failed for URL %s: %s", url_id, e)
        del self._metadata[url_id]
        self._save_metadata()
        return True


# ── singleton ─────────────────────────────────────────────────────────────────

_url_service: Optional[UrlService] = None


def get_url_service() -> UrlService:
    global _url_service
    if _url_service is None:
        from app.services.document_service import get_document_service
        _url_service = UrlService(get_document_service())
    return _url_service