# 15 — Chương 3 fact sheet (Nội dung và phương pháp)

## Claims supported by repository

- The canonical data pipeline is JSONL → import/traceability → `historical_events.raw_json` plus normalized event/support tables. The measured package has 361 records, grade distribution 57/125/177 for grades 10/11/12, and source policy textbook 346 / derived 15.
- `mapData` uses `point`, `multi_point`, `multi_polygon`, `mixed`, `nationwide`, and `no_location`. The terrain normalizer accepts the first four, rejects the last two and reports duplicate/invalid targets.
- The frontend uses Cesium/Resium and a custom React timeline; the built-in Cesium timeline/animation widgets are disabled. World Terrain is conditional, not guaranteed.
- The AI service declares FastAPI, ChromaDB and Google GenAI. No LangChain package was found.
- TTS uses the Viettel AI adapter. FPT.AI is not an active provider in the repository.

## Required revision

Replace generic or legacy technology prose with evidence paths and explicit runtime qualifications. Separate research method from implementation facts, and do not claim source quality, RAG grounding or TTS availability without a measured run.
