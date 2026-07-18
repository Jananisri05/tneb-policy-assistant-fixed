import os
import uuid
import json
import base64
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Tuple, Optional

import fitz
from docx import Document as DocxDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings as ChromaSettings
from groq import Groq

from app.config import settings
from app.models.schemas import DocumentInfo, SourceChunk

logger = logging.getLogger(__name__)
METADATA_FILE = os.path.join(settings.UPLOAD_DIR, "metadata.json")

# Groq vision model for scanned PDF pages
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


class DocumentService:
    def __init__(self):
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        os.makedirs(settings.CHROMA_DB_PATH, exist_ok=True)
        logger.info("Loading embedding model: %s", settings.EMBED_MODEL)
        self.embedder = SentenceTransformer(settings.EMBED_MODEL)
        self.chroma_client = chromadb.PersistentClient(
            path=settings.CHROMA_DB_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self.chroma_client.get_or_create_collection(
            name="tneb_policies",
            metadata={"hnsw:space": "cosine"},
        )
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
        )
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY)
        self._metadata: dict = self._load_metadata()

    def _load_metadata(self) -> dict:
        if os.path.exists(METADATA_FILE):
            with open(METADATA_FILE, "r") as f:
                return json.load(f)
        return {}

    def _save_metadata(self):
        with open(METADATA_FILE, "w") as f:
            json.dump(self._metadata, f, indent=2, default=str)

    def _extract_page_via_vision(self, page: fitz.Page, page_num: int) -> str:
        """Use Groq vision model to extract text from a scanned/image PDF page."""
        try:
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")

            if len(img_bytes) > 3 * 1024 * 1024:
                mat = fitz.Matrix(1.0, 1.0)
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")

            img_b64 = base64.b64encode(img_bytes).decode()

            logger.info(f"Running vision extraction on page {page_num} ({len(img_bytes)//1024}KB)...")
            response = self.groq_client.chat.completions.create(
                model=VISION_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_b64}"
                                },
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Extract all text from this document page exactly as it appears. "
                                    "Preserve headings, bullet points, tables, and paragraph structure. "
                                    "Return only the extracted text, no commentary."
                                ),
                            },
                        ],
                    }
                ],
                max_tokens=4000,
            )
            extracted = response.choices[0].message.content.strip()
            logger.info(f"Vision extracted {len(extracted)} chars from page {page_num}")
            return extracted
        except Exception as e:
            logger.warning(f"Vision extraction failed for page {page_num}: {e}")
            return ""

    def _extract_text_pdf(self, file_path: str) -> List[Tuple[str, int]]:
        """Extract text from PDF. Falls back to Groq vision for scanned pages."""
        pages = []
        doc = fitz.open(file_path)
        total_pages = len(doc)
        logger.info(f"Processing PDF with {total_pages} pages: {file_path}")

        for page_num, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            if text:
                pages.append((text, page_num))
            else:
                logger.info(f"Page {page_num} has no text layer, using vision fallback...")
                vision_text = self._extract_page_via_vision(page, page_num)
                if vision_text:
                    pages.append((vision_text, page_num))
                else:
                    logger.warning(f"Page {page_num}: both text and vision extraction failed, skipping.")

        doc.close()
        return pages

    def _extract_text_docx(self, file_path: str) -> List[Tuple[str, int]]:
        doc = DocxDocument(file_path)
        full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return [(full_text, 1)]

    def _extract_text_txt(self, file_path: str) -> List[Tuple[str, int]]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return [(f.read(), 1)]

    def extract_text(self, file_path: str) -> List[Tuple[str, int]]:
        ext = Path(file_path).suffix.lower()
        if ext == ".pdf":
            return self._extract_text_pdf(file_path)
        elif ext in (".docx", ".doc"):
            return self._extract_text_docx(file_path)
        elif ext == ".txt":
            return self._extract_text_txt(file_path)
        raise ValueError(f"Unsupported file type: {ext}")

    def ingest_document(
        self,
        file_path: str,
        original_name: str,
        uploaded_by: str = "admin",
        uploader_ip: str = "unknown",
    ) -> DocumentInfo:
        doc_id = str(uuid.uuid4())
        logger.info("Ingesting: %s (id=%s)", original_name, doc_id)

        pages = self.extract_text(file_path)
        all_chunks: List[dict] = []
        for page_text, page_num in pages:
            raw_chunks = self.splitter.split_text(page_text)
            for chunk in raw_chunks:
                all_chunks.append({
                    "text": chunk,
                    "page_number": page_num,
                    "chunk_index": len(all_chunks),
                })

        if not all_chunks:
            raise ValueError(
                "No text could be extracted from this document. "
                "The file may be corrupted or contain only unsupported image formats."
            )

        texts = [c["text"] for c in all_chunks]
        logger.info("Embedding %d chunks...", len(texts))
        embeddings = self.embedder.encode(texts, show_progress_bar=False).tolist()

        ids = [f"{doc_id}_{i}" for i in range(len(all_chunks))]

        # FIX 1: Add doc_type="policy" to every chunk's metadata so URL chunks
        # (stored with doc_type="url" by url_service.py) can be distinguished
        # and so all sources compete fairly in retrieval.
        metadatas = [
            {
                "doc_id": doc_id,
                "document_name": original_name,
                "page_number": c["page_number"],
                "chunk_index": c["chunk_index"],
                "doc_type": "policy",          # â† ADDED
            }
            for c in all_chunks
        ]

        batch_size = 100
        for i in range(0, len(ids), batch_size):
            self.collection.upsert(
                ids=ids[i:i + batch_size],
                embeddings=embeddings[i:i + batch_size],
                documents=texts[i:i + batch_size],
                metadatas=metadatas[i:i + batch_size],
            )

        info = DocumentInfo(
            id=doc_id,
            filename=os.path.basename(file_path),
            original_name=original_name,
            size_bytes=os.path.getsize(file_path),
            chunk_count=len(all_chunks),
            uploaded_at=datetime.utcnow(),
            doc_type="policy",
            uploaded_by=uploaded_by,
            uploader_ip=uploader_ip,
        )

        self._metadata[doc_id] = {
            "id": info.id,
            "filename": info.filename,
            "original_name": info.original_name,
            "size_bytes": info.size_bytes,
            "chunk_count": info.chunk_count,
            "uploaded_at": info.uploaded_at.isoformat() if hasattr(info.uploaded_at, "isoformat") else str(info.uploaded_at),
            "doc_type": info.doc_type,
            "uploaded_by": info.uploaded_by,
            "uploader_ip": info.uploader_ip,
        }
        self._save_metadata()
        logger.info("Ingested %d chunks for %s", len(all_chunks), original_name)
        return info

    def retrieve_chunks(
        self,
        query: str,
        top_k: int = None,
        document_ids: Optional[List[str]] = None,
    ) -> List[SourceChunk]:
        top_k = top_k or settings.TOP_K_RESULTS
        query_embedding = self.embedder.encode([query]).tolist()
        where_filter = {"doc_id": {"$in": document_ids}} if document_ids else None

        # FIX 2: Fetch 3Ã— more candidates from ChromaDB so URL chunks (which
        # have fewer total chunks than large PDFs) get a fair chance to surface
        # in the top-K. We then return all of them to the LLM â€” the LLM's
        # context window handles the extra load fine at these sizes.
        n_fetch = min(top_k * 3, self.collection.count() or 1)   # â† CHANGED

        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=n_fetch,                                     # â† CHANGED
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        chunks = []
        if results["documents"] and results["documents"][0]:
            # Sort by relevance score descending and keep only top_k
            raw = list(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ))
            raw.sort(key=lambda x: x[2])          # ascending distance = descending similarity
            raw = raw[:top_k]                      # keep best top_k after wider fetch

            for doc, meta, dist in raw:
                chunks.append(SourceChunk(
                    document_name=meta.get("document_name", "Unknown"),
                    chunk_text=doc,
                    page_number=meta.get("page_number"),
                    chunk_index=meta.get("chunk_index", 0),
                    relevance_score=round(1 - dist, 4),
                ))
        return chunks

    def get_all_chunks_for_doc(self, doc_id: str) -> List[str]:
        results = self.collection.get(
            where={"doc_id": doc_id},
            include=["documents", "metadatas"],
        )
        if not results["documents"]:
            return []
        paired = sorted(
            zip(results["metadatas"], results["documents"]),
            key=lambda x: x[0].get("chunk_index", 0),
        )
        return [doc for _, doc in paired]

    def _parse_doc_info(self, v: dict) -> DocumentInfo:
        """Parse a metadata dict into a DocumentInfo, with fallback defaults."""
        try:
            if isinstance(v.get("uploaded_at"), str):
                v["uploaded_at"] = datetime.fromisoformat(
                    v["uploaded_at"].replace(" ", "T")
                )
            return DocumentInfo(
                id=v.get("id", "unknown"),
                filename=v.get("filename", "unknown"),
                original_name=v.get("original_name", "unknown"),
                size_bytes=v.get("size_bytes", 0),
                chunk_count=v.get("chunk_count", 0),
                uploaded_at=v.get("uploaded_at", datetime.utcnow()),
                doc_type=v.get("doc_type", "policy"),
                uploaded_by=v.get("uploaded_by", "admin"),
                uploader_ip=v.get("uploader_ip", "127.0.0.1"),
            )
        except Exception:
            return DocumentInfo(
                id=v.get("id", "unknown"),
                filename=v.get("filename", "unknown"),
                original_name=v.get("original_name", "unknown"),
                size_bytes=v.get("size_bytes", 0),
                chunk_count=v.get("chunk_count", 0),
                uploaded_at=datetime.utcnow(),
                doc_type=v.get("doc_type", "policy"),
                uploaded_by=v.get("uploaded_by", "admin"),
                uploader_ip=v.get("uploader_ip", "127.0.0.1"),
            )

    def list_documents(self) -> List[DocumentInfo]:
        docs = []
        for v in self._metadata.values():
            try:
                docs.append(self._parse_doc_info(dict(v)))
            except Exception as e:
                logger.warning(f"Error parsing document metadata: {e}")
        return docs

    def get_recent_documents(self, hours: int = 24) -> List[DocumentInfo]:
        """Return documents uploaded within the last `hours` hours."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        recent = []
        for v in self._metadata.values():
            try:
                doc = self._parse_doc_info(dict(v))
                uploaded_at = doc.uploaded_at
                if uploaded_at is None:
                    continue
                if hasattr(uploaded_at, "tzinfo") and uploaded_at.tzinfo is not None:
                    uploaded_at = uploaded_at.astimezone(timezone.utc).replace(tzinfo=None)
                if uploaded_at >= cutoff:
                    recent.append(doc)
            except Exception as e:
                logger.warning(f"Error checking recency for doc: {e}")
        recent.sort(key=lambda d: d.uploaded_at or datetime.min, reverse=True)
        return recent

    def get_document(self, doc_id: str) -> Optional[DocumentInfo]:
        if doc_id not in self._metadata:
            return None
        return self._parse_doc_info(dict(self._metadata[doc_id]))

    def delete_document(self, doc_id: str) -> bool:
        if doc_id not in self._metadata:
            return False
        info = self._metadata[doc_id]
        self.collection.delete(where={"doc_id": doc_id})
        file_path = os.path.join(settings.UPLOAD_DIR, info["filename"])
        if os.path.exists(file_path):
            os.remove(file_path)
        del self._metadata[doc_id]
        self._save_metadata()
        return True

    def collection_count(self) -> int:
        return self.collection.count()


_document_service: Optional[DocumentService] = None


def get_document_service() -> DocumentService:
    global _document_service
    if _document_service is None:
        _document_service = DocumentService()
    return _document_service