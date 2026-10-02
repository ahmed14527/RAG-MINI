# Mini RAG — Chat with your documents

Upload PDFs, Markdown or plain-text files and ask questions about them. Answers are generated **only** from your documents, cite the exact passages (with page numbers) they were built from, and say so plainly when the documents don't contain the answer.

- **Backend:** Django 5 + Django REST Framework + Channels (Daphne), JWT auth
- **RAG:** pypdf parsing → page/section-aware chunking → OpenAI-compatible embeddings → ChromaDB → cited answers from an OpenAI-compatible chat model
- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **Infra:** Docker Compose (two services, one volume). No external database or vector service is needed.

---

## Architecture

```
 Browser ── Next.js frontend (:3000)
    │          serves the UI; the browser then calls the API directly
    ▼
 Django API (:8000)  ── JWT auth, documents, chat (JSON / SSE / WebSocket)
    │
    ▼
 RAG pipeline (backend/rag/pipeline.py)
    ├── Ingestion: parse → chunk → embed ──────────────┐
    └── Answering: embed question → retrieve → prompt  │
             │                         │               │
             ▼                         ▼               ▼
      Chat model (LLM)        ChromaDB (embedded, persisted to disk)
      any OpenAI-compatible   + SQLite (users, document metadata)
      API                     + media/ (original files)
```

Everything stateful lives under one data directory (`DATA_DIR`): `db.sqlite3`, `media/` and `chroma_db/`. In Docker that is the `rag_data` volume.

## RAG pipeline

```
Upload ─► Parse ─► Chunk ─► Embed ─► Index (Chroma)
                                         │
Question ─► Embed ─► Owner-scoped vector search ─► Score filter + dedupe
         ─► Context budget ─► Grounded prompt ─► LLM ─► Answer + cited sources
```

| Stage | Implementation |
| --- | --- |
| **Parsing** | PDF via `pypdf`, one section per page (1-based page numbers). Markdown split by headings (the heading becomes `section` metadata). Plain text as one section. Encrypted, corrupted, binary and text-less (scanned) files are rejected with a clear message. |
| **Chunking** | Word windows of `RAG_CHUNK_SIZE` (300) with `RAG_CHUNK_OVERLAP` (50). Chunks never span two pages or sections. Deterministic chunk IDs: `doc{id}-chunk{n}`. |
| **Embeddings** | `EMBEDDING_MODEL` (default `text-embedding-3-small`), batched (`RAG_EMBEDDING_BATCH_SIZE`). |
| **Vector store** | ChromaDB `PersistentClient`, cosine distance. Each chunk stores `owner_id`, `document_id`, `document`, `chunk_index`, `page`, `section`. Re-indexing replaces a document's chunks; deleting a document removes them. |
| **Duplicates** | Files are SHA-256 hashed. Uploading the same file twice returns `409` instead of indexing it again. |
| **Retrieval** | Always filtered by the requesting user, optionally by selected document IDs. Over-fetches `2 × top_k`, drops chunks below `RAG_MIN_SCORE` cosine similarity, removes duplicate text, and caps context at `RAG_MAX_CONTEXT_CHARS`. |
| **No context** | If there are no ready documents, or nothing passes the threshold, a fixed "not found in your documents" answer is returned **without calling the LLM**. |
| **Prompt** | A system prompt requires answering only from numbered passages, inline `[n]` citations, explicitly saying when the answer isn't in the documents, labelling inferences as assumptions, conciseness, and treating passages as untrusted data. The last 6 conversation turns are included for follow-ups. |
| **Sources** | Every passage given to the model is returned with its document, page/section, chunk ID, similarity score and snippet. Passages the answer cites (`[n]`) are flagged `cited: true`. |

## Quick start (Docker)

```bash
git clone https://github.com/ahmed14527/RAG-MINI.git
cd RAG-MINI
cp .env.example .env        # then set OPENAI_API_KEY
docker compose up --build
```

- Frontend: <http://localhost:3000>. Create an account, upload a document, and ask questions.
- API: <http://localhost:8000> (health check: <http://localhost:8000/health/>)

Notes:
- If `SECRET_KEY` is empty, the backend generates one on first start and stores it in the data volume, so logins survive restarts. Set it explicitly for real deployments.
- The browser calls the API directly. If you serve the app somewhere other than `localhost`, set `PUBLIC_API_URL` (the API URL as the browser sees it) and `CORS_ALLOWED_ORIGINS` / `ALLOWED_HOSTS` in `.env`. `PUBLIC_API_URL` is read at request time, so no rebuild is needed.
- Data persists in the `rag_data` volume. `docker compose down -v` deletes it.
- Containers run as non-root users and restart `unless-stopped`. `.env` is never copied into images.

**Development with live reload in Docker:**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Local setup (without Docker)

Prerequisites: Python 3.11+, Node.js 20.9+ (22 recommended).

**Backend**

```bash
cp .env.example .env               # at the repo root; set OPENAI_API_KEY
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py runserver         # http://127.0.0.1:8000 (Daphne, with WebSockets)
```

Run backend commands from `backend/`. `manage.py` loads the root `.env` (found by searching parent directories) and defaults to `project.settings.dev`. Local data (`db.sqlite3`, `media/`, `chroma_db/`) is stored in `backend/` unless `DATA_DIR` is set.

**Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev                        # http://localhost:3000
```

The frontend reads `API_URL` (default `http://localhost:8000`) at request time:

```bash
API_URL=http://127.0.0.1:8000 npm run dev
```

### Using another model provider

Any OpenAI-compatible API works through `OPENAI_BASE_URL`. For example, a local [Ollama](https://ollama.com):

```bash
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama              # any non-empty value
LLM_MODEL=llama3.1
EMBEDDING_MODEL=nomic-embed-text
```

Embeddings can use a different provider than chat via `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY`.

> Changing `EMBEDDING_MODEL` changes the vector space. Re-index afterwards:
> `python manage.py reindex_documents` from `backend/` (or `docker compose exec backend python manage.py reindex_documents`).

## Environment variables

See [`.env.example`](.env.example) for the full annotated list.

| Variable | Default | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | **Required** for uploads and chat. Key for the chat model, and for embeddings unless overridden. |
| `OPENAI_BASE_URL` | OpenAI | Custom OpenAI-compatible endpoint. |
| `LLM_MODEL` | `gpt-4o-mini` | Chat model. |
| `LLM_TEMPERATURE` / `LLM_TIMEOUT_SECONDS` | `0.1` / `60` | Generation settings. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model. |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` | chat values | Separate embedding provider. |
| `SECRET_KEY` | dev: fixed insecure key | **Required in production** (`project.settings.prod`). |
| `DJANGO_SETTINGS_MODULE` | `project.settings.dev` | `manage.py` default. Docker and ASGI/WSGI default to `prod`. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Production host whitelist. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,...` | Browser origins allowed to call the API. |
| `DATA_DIR` | `backend/` | Location of `db.sqlite3`, `media/`, `chroma_db/`. |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` | `300` / `50` | Chunk size and overlap, in words. |
| `RAG_TOP_K` | `5` | Passages per answer (client may request 1–20). |
| `RAG_MIN_SCORE` | `0.2` | Minimum cosine similarity for a passage to be used. |
| `RAG_MAX_CONTEXT_CHARS` | `12000` | Context budget sent to the LLM. |
| `RAG_MAX_UPLOAD_MB` | `20` | Upload size limit. |
| `RAG_CHAT_RATE` / `RAG_UPLOAD_RATE` | `30/min` / `60/hour` | Per-user throttles. |
| `LOG_LEVEL` / `LOG_FILE` | `INFO` / — | Logging (console, plus optional file). |
| `PUBLIC_API_URL`, `BACKEND_PORT`, `FRONTEND_PORT` | `http://localhost:8000`, `8000`, `3000` | Docker Compose only. |

## API

All endpoints are under `/api/v1/` and return errors as `{"error": "...", "details": ...}`. Except for health, register and login, requests need `Authorization: Bearer <access token>`.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health/` (also `/api/v1/health/`) | Public. DB and vector store status, whether the AI provider is configured, upload limits. |
| `POST` | `/account/register/` | `{username, email, password, confirm_password}` → user + tokens |
| `POST` | `/account/login/` | `{username, password}` → user + tokens |
| `POST` | `/account/token/refresh/` | `{refresh}` → `{access}` |
| `GET` | `/documents/` | List your documents (status, chunk/page count, size, type, date). |
| `POST` | `/documents/upload/` | Multipart `file` (`.pdf`, `.txt`, `.md`). Indexes synchronously and returns `201` with the document. Errors: `400` invalid file, `409` duplicate, `422` no extractable text, `502`/`503` provider or index failure. |
| `GET` | `/documents/{id}/` | One document. |
| `DELETE` | `/documents/{id}/` | Delete the document, its file and its vectors. `204`. |
| `POST` | `/documents/{id}/reindex/` | Re-run ingestion (e.g. after a provider outage). |
| `GET` | `/documents/{id}/file/` | Download the original file (owner only). |
| `POST` | `/chat/` | Answer with sources (JSON). |
| `POST` | `/chat/stream/` | The same, streamed as Server-Sent Events. |
| `POST` | `/rag/upload/` | Original upload endpoint, kept for existing clients. |
| `WS` | `/api/v1/ws/chat/?token=<access>` | WebSocket chat (see below). |

**Chat request**

```json
{
  "message": "How many vacation days do employees get?",
  "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}],
  "document_ids": [3],
  "top_k": 5
}
```

Only `message` is required. `document_ids` limits the search to those documents.

**Chat response** (`POST /chat/`)

```json
{
  "success": true,
  "data": {
    "answer": "Employees receive 25 days of paid vacation per year [1].",
    "grounded": true,
    "sources": [
      {
        "id": 1, "document_id": 3, "document": "handbook.pdf", "page": 1, "section": null,
        "chunk_id": "doc3-chunk0", "score": 0.61, "snippet": "Employees receive 25 days...", "cited": true
      }
    ],
    "retrieval": {"top_k": 5, "candidates": 6, "used": 3, "min_score": 0.2, "latency_ms": 41, "generation_ms": 980}
  }
}
```

**Streaming** (`POST /chat/stream/`, `text/event-stream`): `sources` (sources + retrieval metadata) → `delta` (`{"text": "..."}`, repeated) → `done` (`{"cited": [1], "generation_ms": ...}`). If generation fails, an `error` event is sent. Validation, authentication and retrieval errors are returned as normal JSON errors before the stream starts.

**WebSocket**: send `{"query": "...", "top_k": 5, "document_ids": []}`. You receive `welcome`, then `sources`, `delta`… and `done` messages, or `{"error", "details"}`.

A Postman collection for the original endpoints is [here](https://documenter.getpostman.com/view/33316118/2sB3QFSCqa).

## Frontend

- **Auth:** sign in or register. Tokens are stored in `localStorage` and refreshed automatically. Expired sessions return to the sign-in screen with a notice.
- **Documents sidebar:** drag & drop or file picker, client-side type/size validation, upload progress then a processing state, and Ready / Processing / Failed status with chunk and page counts, size and date. Each document can be opened, deleted (with confirmation) or retried after a failure. Selecting documents focuses the chat on them.
- **Chat:** streaming Markdown answers, Enter to send (Shift+Enter for a new line), stop, retry, copy, and a step-by-step "searching → writing" status. Conversation history is kept for the browser session (`sessionStorage`).
- **Sources:** each answer lists its cited passages with page or section and a relevance bar. Clicking an inline `[n]` badge or a source expands the snippet. "Open page N" opens the original PDF at that page. Retrieved but uncited passages are listed separately.
- **States:** empty state with a pipeline guide and suggested questions, a banner when the backend is down or the AI provider isn't configured, inline errors, light/dark theme, and responsive layout (the sidebar becomes a drawer on mobile).

## Testing

```bash
# Backend: 41 tests (parsing, chunking, upload/duplicates/errors, owner isolation,
# retrieval, no-context behaviour, chat JSON/SSE/WebSocket, auth). No API key needed:
# embeddings and the LLM are mocked.
cd backend && python manage.py test

# Frontend: SSE parsing, API client errors, sources/citations, chat error state, upload validation
cd frontend && npm test
npm run lint && npm run typecheck
```

## Project structure

```
├── backend/                      # Django API (run commands from here)
│   ├── manage.py
│   ├── account/                  # Registration, JWT login, WebSocket JWT middleware (+ tests.py)
│   ├── project/
│   │   ├── settings/             # base.py (all config), dev.py, prod.py
│   │   ├── urls.py, asgi.py      # HTTP + WebSocket routing (Daphne: project.asgi:application)
│   ├── rag/
│   │   ├── pipeline.py           # Ingestion, retrieval, prompt, answer (the core)
│   │   ├── helpers/
│   │   │   ├── text_processing.py  # PDF/MD/TXT extraction + chunking
│   │   │   ├── llm.py              # Embedding + chat clients (OpenAI-compatible)
│   │   │   └── vector_store.py     # Chroma access (owner-scoped)
│   │   ├── views.py, urls.py     # REST + SSE endpoints
│   │   ├── consumers.py          # WebSocket chat
│   │   ├── errors.py             # Error types + API error format
│   │   ├── models.py             # Document
│   │   ├── management/commands/reindex_documents.py
│   │   └── tests/
│   ├── requirements/             # base.txt, dev.txt, prod.txt
│   ├── docker/entrypoint.sh      # Secret key bootstrap + migrations
│   ├── Dockerfile                # Backend image (build context: backend/)
│   └── .dockerignore
├── frontend/                     # Next.js app
│   ├── src/
│   │   ├── app/                  # Layout, page (reads API_URL at runtime), global styles
│   │   ├── components/           # App shell, auth, documents/, chat/
│   │   ├── hooks/                # useDocuments, useChat, useTheme
│   │   └── lib/                  # API client, SSE parser, types, formatting
│   └── Dockerfile                # Frontend image (dev + standalone production targets)
├── docker-compose.yml            # Production-like stack
├── docker-compose.dev.yml        # Live-reload overrides
└── .env.example                  # Shared configuration (used by backend and Compose)
```

## Upgrading from the previous version

The original version stored chunks in a `pdf_chunks` collection with no owner metadata. Running `migrate` converts existing uploads into `Document` rows marked **Failed: "Indexed by a previous version"**. Re-index them with the **Retry** button in the UI or `python manage.py reindex_documents` (from `backend/`).

The backend now lives in `backend/`. If you ran it locally before this move, your data (`db.sqlite3`, `media/`, `chroma_db/`) is in the repository root. Move it into `backend/`, or set `DATA_DIR` to the old location. Docker volumes are unaffected.

## Known limitations

- **Synchronous ingestion:** documents are indexed inside the upload request. That is fine for typical documents, but very large files keep the request open until embedding finishes. A background worker would be the next step and is intentionally left out for simplicity.
- **No OCR:** scanned or image-only PDFs are rejected as having no readable text. Only `.pdf`, `.txt` and `.md` are supported.
- **Follow-up questions:** retrieval uses the current message only (history goes to the LLM, not the retriever). Vague follow-ups like "tell me more" may retrieve less relevant passages.
- **No reranker:** results are ranked by vector similarity alone. `RAG_MIN_SCORE` may need tuning for models other than OpenAI's.
- **Single-node storage:** SQLite and embedded Chroma suit one backend process. Scaling out would need Postgres and a client/server vector store.
- **Tokens in `localStorage`:** this is a standard SPA trade-off. A cookie-based session would be more resistant to XSS.
