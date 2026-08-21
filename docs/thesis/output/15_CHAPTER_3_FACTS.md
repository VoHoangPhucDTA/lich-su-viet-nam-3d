# 15 — Chương 3 fact sheet (Nội dung và phương pháp)

## Claims supported by repository

- The canonical data pipeline is JSONL → import/traceability → `historical_events.raw_json` plus normalized event/support tables. The measured package has 361 records, grade distribution 57/125/177 for grades 10/11/12, and source policy textbook 346 / derived 15.
- `mapData` uses `point`, `multi_point`, `multi_polygon`, `mixed`, `nationwide`, and `no_location`. The terrain normalizer accepts the first four, rejects the last two and reports duplicate/invalid targets.
- The frontend uses Cesium/Resium and a custom React timeline; the built-in Cesium timeline/animation widgets are disabled. World Terrain is conditional, not guaranteed.
- The AI service declares FastAPI, ChromaDB and Google GenAI. No LangChain package was found.
- TTS uses the Viettel AI adapter. FPT.AI is not an active provider in the repository.
- RAG-01 uses 60 fixed retrieval cases (59 scored + 1 insufficient-context control): Hit@1 88.14%, Hit@3 98.31%, Hit@5 100%, MRR 93.36%. A separate same-case generation benchmark contains 27 tasks/54 outputs; source-bound owner adjudication accepted RAG 23/27 and Gemini-only 13/27.
- RAG-02 is a two-layer bounded runtime factual guard over 10 curated critical facts (COUNT/DATE/PERSON/YEAR), with at most one repair and controlled failure. It does not verify all historical facts.
- The GIS layer is a lazy 34-unit modern administrative reference using GADM by default, not period-correct historical boundaries; its license status remains unverified.

## Required revision

Replace generic or legacy technology prose with evidence paths and explicit runtime qualifications. Present the measured RAG results only within their fixed benchmark, keep provider/source/GIS limitations, and do not claim universal factual accuracy, educational effectiveness, or TTS availability.
