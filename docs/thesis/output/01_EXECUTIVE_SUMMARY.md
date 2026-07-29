# 01 — Executive summary

The repository implements a three-tier learning system for Vietnamese history: React/Vite frontend with Cesium/Resium map visualization; Spring Boot 4 REST backend with MySQL/Flyway and a hybrid JPA/JDBC persistence layer; and a FastAPI AI service using ChromaDB and Google GenAI configuration. Canonical event data is a 361-record JSONL package with flat `mapData`, hierarchy, and `sourcePolicy`; the backend stores the source JSON in `historical_events.raw_json`.

Verified strengths: the terrain target normalization and inspection utilities have focused tests; TypeScript compilation and direct Vite build pass; the backend packages; 37 migrations and a broad API surface are present; the read-only terrain audit parses all 361 records and resolves 380/380 GADM references.

Important audit qualifications: the live database, Docker-backed integrations, AI service, TTS provider, Cloudinary storage and production RAG corpus were not runtime-verified. Terrain coverage is conditional (136/361, 37.67%) and nationwide/no-location records are intentionally unsupported. The thesis mentions LangChain and FPT.AI, but the current repository has no LangChain dependency and the active TTS provider is Viettel AI. Chương 5 screenshots and empirical performance/RAG metrics are not present in the Word file; they remain explicit evidence gaps.
