# History RAG AI Service

FastAPI foundation, canonical SGK corpus validation, and a resumable Gemini
embedding pipeline for the Vietnamese history learning application. ChromaDB,
persistent indexing code, artifact validation, and inspection are included;
retrieval and generation remain outside this stage.

## Quick start

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m pytest
python -m scripts.validate_corpus
python -m scripts.build_embeddings --dry-run
python -m scripts.build_chroma_index --dry-run
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Health check: `GET http://127.0.0.1:8001/ai/health`.

Copy `.env.example` to an untracked `.env` only when local overrides are
needed. The service starts normally without a Gemini API key.
