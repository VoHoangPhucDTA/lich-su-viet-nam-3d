# 02 — Thesis ↔ repository gap analysis

| Thesis area | Legacy claim/evidence | Repository evidence | Action | Cross-reference |
| --- | --- | --- | --- | --- |
| Ch3 — stack/method | LangChain, FPT.AI, old map wording | Current repo uses custom FastAPI/Chroma/Google GenAI configuration and Viettel AI TTS; Cesium widget timeline is disabled | REWRITE | 13,15 |
| Ch3 — data | SGK/Wikipedia/GADM narrative | 361 canonical records; sourcePolicy textbook/derived; GADM refs statically resolve | MINOR_UPDATE | 06,15,raw/terrain-audit-summary.json |
| Ch4 — architecture | Conceptual 3-tier diagrams | Frontend/backend/AI files and 68 REST routes are present; hybrid JPA/JDBC | KEEP + EVIDENCE | 05,07,uml |
| Ch4 — database | ERD without migration proof | V1–V37 and 54 tables parsed; live schema not queried | MINOR_UPDATE | 06,08 |
| Ch5 — UI | 10 screenshot placeholders | No approved screenshot artifacts; manual checklist supplied | NEED_SCREENSHOT | 12,screenshots |
| Ch5 — quality | Absolute performance/RAG claims | No benchmark or RAG evaluation log; build bundle warning and partial test evidence | NEED_MEASUREMENT | 11,14 |
| Ch6 — conclusion | Unqualified completion claims | Separate verified, conditional and blocked scope | REWRITE | 18,21 |

Actions are deliberately conservative: a feature is not promoted to ‘implemented’ solely because a controller, UI label or Word paragraph exists.
