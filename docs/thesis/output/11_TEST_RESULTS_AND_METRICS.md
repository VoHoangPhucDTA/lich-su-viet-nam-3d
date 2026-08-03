# 11 — Test results and metrics

| Check | Status | Result | Qualification |
| --- | --- | --- | --- |
| Frontend curated Vitest | PASS | 5 files / 45 tests / 0 failed | focused terrain/API/exam tests |
| Frontend exam-data | PASS | 3 TAP tests / 0 failed | npm run test:exam-data |
| Frontend TypeScript | PASS | tsc -b exit 0 | 52.5 s |
| Frontend direct Vite | PASS | 4,166 modules; 5.47 MB main minified | chunk-size warning |
| Frontend full test | TIMEOUT | 180 s watchdog | not a failure conclusion |
| Frontend lint | FAIL | 19 errors / 5 warnings | existing source issues; not modified |
| Backend tests | PARTIAL | 206 run: 190 pass, 1 error, 15 skipped | history-rag/v1 absent; Docker unavailable |
| Backend package | PASS | Spring Boot jar produced | mvnw package |
| AI pytest | BLOCKED | pytest module missing in ai-service/venv | requirements-dev not installed |
| Database/runtime | UNVERIFIED | DB_LIVE_UNVERIFIED | no Docker daemon/live endpoint |

## Terrain/data metrics

| Metric | Value |
| --- | --- |
| Canonical records | 361 |
| Parse errors | 0 |
| Valid mapData | 361/361 |
| GADM refs | 380/380 resolved |
| Geo types | {"mixed": 107, "multi_point": 4, "multi_polygon": 2, "nationwide": 56, "no_location": 169, "point": 23} |
| Terrain eligible | 136/361 (37.67%) |
| Terrain ineligible | 225: 56 nationwide + 169 no_location |
| Duplicate coordinate diagnostics | 134 occurrences; 23 different-label duplicates |
| RAG quality | not measured |
| Runtime DB comparison | unverified |

These are audit measurements, not product SLAs. Do not convert the build size or static counts into claims of runtime performance.
