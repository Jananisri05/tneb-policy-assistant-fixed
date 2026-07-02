---
title: TNEB PolicyAI
emoji: ⚡
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# TNEB PolicyAI

An AI-powered policy assistant application built for a public utility organization (TNEB/TNPDCL) that enables employees to query internal policy documents through a conversational interface, while giving admins full control over document ingestion and management via a Retrieval-Augmented Generation (RAG) pipeline.

---

## Overview

TNEB PolicyAI lets employees search and get summarized answers from internal policy documents without ever seeing the underlying files directly. Admins manage the knowledge base — uploading PDFs, ingesting content from URLs, and monitoring the system — through a secured, authenticated interface.

The system is built as a full-stack RAG application: documents are parsed, chunked, embedded, and stored in a vector database; incoming employee queries are embedded and matched against this store; and a Groq-hosted LLM generates grounded answers from the retrieved context.

---

## Features

- **Employee query interface** — Natural-language policy search and summarization, with no visibility into raw source documents.
- **Admin document management** — Upload PDFs or ingest content directly from URLs into the knowledge base.
- **Scanned PDF support** — PyMuPDF handles standard text extraction, with a Groq vision model fallback for scanned/image-based PDFs.
- **New-document notifications** — Employees are notified via a popup when new policy documents are added.
- **Secure admin authentication** — SHA-256 hashed credentials with Bearer token session management.
- **Admin self-registration** — Gated by a secret signup key stored as an environment variable.
- **Policy search & summarize endpoints** — Dedicated API routes exposed to employees for querying and condensing policy content.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI |
| Vector Store | ChromaDB |
| Embeddings | SentenceTransformer |
| LLM | Groq API |
| Document Chunking | LangChain |
| PDF Parsing | PyMuPDF (+ Groq vision fallback for scanned PDFs) |
| Frontend | React (Vite) |
| Database | MongoDB Atlas |
| Deployment Server | Node.js / Express (serves frontend + backend together) |
| Hosting | Render |

---

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌───────────────────┐
│  React Frontend │ ───▶ │  Express Server   │ ───▶ │   FastAPI Backend │
│  (Vite build)   │      │ (static + proxy)  │      │                   │
└─────────────────┘      └──────────────────┘      └─────────┬─────────┘
                                                                │
                        ┌───────────────────────────────────────┼───────────────────────────┐
                        ▼                                       ▼                            ▼
                ┌───────────────┐                      ┌────────────────┐          ┌──────────────────┐
                │   ChromaDB    │                      │  MongoDB Atlas │          │     Groq API      │
                │ (vector store)│                      │ (users, meta)  │          │ (LLM + vision OCR)│
                └───────────────┘                      └────────────────┘          └──────────────────┘
```

**Ingestion flow:** Document/URL → PyMuPDF (or Groq vision for scans) → LangChain chunking → SentenceTransformer embeddings → ChromaDB

**Query flow:** Employee query → embedding → ChromaDB similarity search → retrieved context + query → Groq LLM → grounded answer

---

## Project Structure

```
tneb-policyai/
├── backend/
│   ├── main.py                # FastAPI app entrypoint
│   ├── routes/
│   │   ├── auth.py            # Admin login/signup, token sessions
│   │   ├── documents.py       # Upload, URL ingestion, notifications
│   │   └── query.py           # Search & summarize endpoints
│   ├── services/
│   │   ├── ingestion.py       # PDF parsing, chunking, embedding
│   │   ├── vision_fallback.py # Groq vision OCR for scanned PDFs
│   │   └── rag.py             # Retrieval + LLM generation
│   └── db/
│       └── chroma_client.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── ChatMessage.jsx
│   │   │   ├── SourcesPanel.jsx
│   │   │   └── SummarizeModal.jsx
│   │   ├── App.jsx
│   │   └── index.css
│   └── vite.config.js
├── server.js                  # Combined Express server (serves React build + proxies backend)
├── .env.example
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python 3.10+
- MongoDB Atlas connection string
- Groq API key

### 1. Clone and install

```bash
git clone <repo-url>
cd tneb-policyai

# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install

# Server
cd ..
npm install
```

### 2. Environment variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
MONGODB_URI=your_mongodb_atlas_uri
ADMIN_SIGNUP_KEY=your_secret_signup_key
CHROMA_PERSIST_DIR=./chroma_data
PORT=3000
```

### 3. Build and run

```bash
# Build the frontend
cd frontend
npm run build

# Start the combined server (serves frontend + backend)
cd ..
npm start
```

The app will be available at `http://localhost:3000`.

---

## Deployment (Render)

This project runs as a single deployable service on Render:

1. A combined **Express server** (`server.js`) serves the built React frontend as static files and proxies/mounts the FastAPI backend.
2. **MongoDB Atlas** is used for persistent storage (no reliance on Render's ephemeral filesystem for critical data).
3. Set all required environment variables in the Render dashboard.
4. Configure the build command to install dependencies and build the frontend, and the start command to launch `server.js`.

---

## Authentication

- Admin accounts are created via a self-registration flow gated by `ADMIN_SIGNUP_KEY`.
- Passwords are stored as SHA-256 hashes.
- Sessions are managed via Bearer tokens; protected admin routes require a valid token in the `Authorization` header.
- Employees interact through unauthenticated (or separately authenticated, depending on deployment) query endpoints with no access to raw documents or the admin panel.

---

## API Overview

| Endpoint | Access | Description |
|---|---|---|
| `POST /auth/signup` | Admin (with signup key) | Register a new admin |
| `POST /auth/login` | Admin | Authenticate, receive Bearer token |
| `POST /documents/upload` | Admin | Upload a PDF for ingestion |
| `POST /documents/url` | Admin | Ingest a document from a URL |
| `GET /documents/notifications` | Employee | Check for newly added documents |
| `POST /query/search` | Employee | Search policies by natural-language query |
| `POST /query/summarize` | Employee | Get a summarized answer for a query |

---

## Roadmap / Future Improvements

- Role-based access control beyond admin/employee
- Persistent object storage for uploaded PDFs (e.g., S3-compatible bucket)
- Analytics dashboard for query trends
- Multi-language support for regional policy documents

---

## License

Internal academic/internship project — not licensed for external distribution.
