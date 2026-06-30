# TNEB PolicyAI — RAG-Powered Policy Assistant

An AI-powered chatbot for TNEB employees to query policy documents using Retrieval-Augmented Generation (RAG).

## Architecture

```
Frontend (React + Vite)
       │
       │ HTTP/REST
       ▼
Backend (FastAPI)
  ├── /api/v1/documents  — Upload, list, delete policy documents
  ├── /api/v1/query      — Ask questions, search policies
  └── /api/v1/health     — System status

Backend Services
  ├── DocumentService
  │     ├── Text extraction (PyMuPDF, python-docx)
  │     ├── Chunking (LangChain RecursiveCharacterTextSplitter)
  │     ├── Embedding (sentence-transformers/all-MiniLM-L6-v2)
  │     └── Storage (ChromaDB vector database)
  └── RAGService
        ├── Semantic retrieval (cosine similarity)
        └── Answer generation (Claude API)
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- An Anthropic API key (get one at https://console.anthropic.com)

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

chmod +x start.sh
./start.sh
```

Or manually:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend runs at: http://localhost:8000
API docs at: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
chmod +x start.sh
./start.sh
```

Or manually:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:5173

## Usage

1. Open http://localhost:5173
2. Upload a PDF/DOCX policy document from the sidebar
3. Wait for indexing (embedding generation)
4. Ask questions in natural language
5. Click source badges to see retrieved context chunks

## Features

| Feature              | Description                                      |
| -------------------- | ------------------------------------------------ |
| Document upload      | PDF, DOCX, TXT support with progress indicator   |
| Q&A mode             | Conversational answers with citation             |
| Policy search        | Keyword/semantic search across all documents     |
| Summarize            | Brief, detailed, or bullet-point summaries       |
| Source panel         | View exact retrieved chunks and relevance scores |
| Scoped search        | Filter queries to specific documents             |
| Conversation history | Last 3 turns sent for context                    |

## API Reference

### Upload Document

```
POST /api/v1/documents/upload
Content-Type: multipart/form-data
Body: file=<file>
```

### Ask a Question

```
POST /api/v1/query/
{
  "query": "How many casual leaves per year?",
  "mode": "qa",          // "qa" | "search"
  "document_ids": null,  // null = search all
  "conversation_history": []
}
```

### Summarize

```
POST /api/v1/query/summarize
{
  "document_id": "uuid-here",
  "summary_type": "brief"  // "brief" | "detailed" | "bullets"
}
```

## Configuration (.env)

| Variable           | Default           | Description                |
| ------------------ | ----------------- | -------------------------- |
| ANTHROPIC_API_KEY  | required          | Your Claude API key        |
| CLAUDE_MODEL       | claude-sonnet-4-6 | LLM model to use           |
| EMBED_MODEL        | all-MiniLM-L6-v2  | Sentence transformer model |
| CHUNK_SIZE         | 800               | Characters per text chunk  |
| CHUNK_OVERLAP      | 150               | Overlap between chunks     |
| TOP_K_RESULTS      | 5                 | Chunks retrieved per query |
| MAX_UPLOAD_SIZE_MB | 20                | Upload size limit          |

## Project Structure

```
tneb-policy-assistant/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, lifespan
│   │   ├── config.py            # Settings from .env
│   │   ├── models/schemas.py    # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── documents.py     # Upload, list, delete endpoints
│   │   │   └── query.py         # QA, search, summarize endpoints
│   │   └── services/
│   │       ├── document_service.py  # Extraction, chunking, embedding, ChromaDB
│   │       └── rag_service.py       # Retrieval + Claude API calls
│   ├── data/
│   │   ├── uploads/             # Stored document files
│   │   └── vectorstore/         # ChromaDB persistent storage
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx              # Main layout, chat logic
    │   ├── components/
    │   │   ├── Sidebar.jsx      # Document list + upload dropzone
    │   │   ├── ChatMessage.jsx  # Message bubbles + markdown
    │   │   ├── SourcesPanel.jsx # Retrieved chunks viewer
    │   │   └── SummarizeModal.jsx
    │   ├── hooks/useDocs.js     # Document state management
    │   └── services/api.js      # Axios API client
    └── vite.config.js
---
title: TNEB PolicyAI
emoji: ⚡
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# TNEB PolicyAI
AI-powered policy assistant for TNEB employees.
```
