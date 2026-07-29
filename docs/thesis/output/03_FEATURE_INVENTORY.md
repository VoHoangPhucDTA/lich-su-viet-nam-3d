# 03 — Feature inventory

| ID | Feature | Evidence | Classification | Location |
| --- | --- | --- | --- | --- |
| FEAT-01 | Home / source overview | CoiNguonPage at `/home` | IMPLEMENTED_NOT_RUNTIME_VERIFIED | frontend/src/App.tsx:90 |
| FEAT-02 | Browse/search/filter/timeline | AllEventsPage, Timeline and `/api/events`, `/api/timeline` | IMPLEMENTED_AND_VERIFIED (static/tests) | frontend/src/App.tsx:92; backend EventController |
| FEAT-03 | 3D map / geo rendering | CesiumMap + GeoJSON province layer; EllipsoidTerrainProvider default | IMPLEMENTED_NOT_RUNTIME_VERIFIED | frontend/src/components/CesiumMap.tsx; MapPage.tsx |
| FEAT-04 | Terrain exploration | Target normalization, session guard, enter/exit restore and focused tests | IMPLEMENTED_AND_VERIFIED (static/tests) | frontend/src/utils/terrainTargets.ts; terrain tests |
| FEAT-05 | Event detail and hierarchy | Event pages, children/related endpoints and parent-child navigation | IMPLEMENTED_NOT_RUNTIME_VERIFIED | EventController; EventPopup; MapPage |
| FEAT-06 | Authentication/social auth | Register/login/verify/reset/change/delete and Google/Facebook routes | IMPLEMENTED_NOT_RUNTIME_VERIFIED | AuthController; protected routes |
| FEAT-07 | Profile/progress | ProgressController and protected profile routes | IMPLEMENTED_NOT_RUNTIME_VERIFIED | ProgressController; App.tsx |
| FEAT-08 | Quiz and AI generation | AiQuizController + FastAPI `/generate`; Chroma/GenAI configuration | PARTIALLY_IMPLEMENTED / RUNTIME UNVERIFIED | AiQuizController; ai-service/app/api |
| FEAT-09 | Exam catalog/session/submission | Exam controllers, V31–V33 and frontend exam routes | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Exam*Controller; App.tsx |
| FEAT-10 | TTS narration | TTS APIs and Viettel provider; asset flow flag defaults false | PARTIALLY_IMPLEMENTED | ViettelTextToSpeechProvider; application.properties |
| FEAT-11 | Admin | Dashboard/users/events and AI candidate review routes | IMPLEMENTED_NOT_RUNTIME_VERIFIED | AdminController; AiCandidateController |
| FEAT-12 | Cloudinary media/avatar | SDK and conditional services/configuration | IMPLEMENTED_NOT_RUNTIME_VERIFIED | CloudinaryService; cloudinaryService.ts |
| FEAT-13 | Data import/provenance | JSONL importer, source tables, import traceability migrations | IMPLEMENTED_NOT_RUNTIME_VERIFIED | data_import_runs; importer packages |
| FEAT-14 | RAG evaluation | Retrieval/debug endpoints exist; no evaluation corpus/metrics verified | PLANNED / NEEDS MEASUREMENT | ai-service routes; 14 |
