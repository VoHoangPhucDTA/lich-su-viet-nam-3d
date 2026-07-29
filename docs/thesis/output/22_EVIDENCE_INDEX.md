# 22 — Evidence index

| Evidence ID | Claim | Primary path |
|---|---|---|
| E-001 | Baseline commit/status/hash | `raw/git_snapshot.txt`; `00_REPOSITORY_SNAPSHOT.md` |
| E-002 | Thesis structure/placeholders | `00_REPOSITORY_SNAPSHOT.md`; `.audit_tmp/docx_extract/docx_structure.json` (workspace-only) |
| E-003 | Frontend route inventory | `04_FRONTEND_ROUTES_AND_COMPONENTS.md`; `frontend/src/App.tsx` |
| E-004 | Backend API inventory | `07_API_CATALOG.md`; controller source tree |
| E-005 | AI routes/config | `07_API_CATALOG.md`; `ai-service/app/api` |
| E-006 | Flyway/table inventory | `06_DATABASE_AND_DATA_PIPELINE.md`; `backend/src/main/resources/db/migration` |
| E-007 | Canonical JSONL/hash/counts | `06_DATABASE_AND_DATA_PIPELINE.md`; `raw/terrain-audit-summary.json` |
| E-008 | Terrain normalizer/session | `03_FEATURE_INVENTORY.md`; `frontend/src/utils/terrainTargets.ts`; `MapPage.tsx`; tests |
| E-009 | TTS provider/config | `13_TECHNOLOGY_VERSIONS.md`; backend Viettel provider and `application.properties` |
| E-010 | Build/tests | `11_TEST_RESULTS_AND_METRICS.md`; sanitized raw logs |
| E-011 | Word correction map | `02`, `15`–`19`, `12_SCREENSHOT_MANIFEST.md` |
| E-012 | UML source/render status | `10_UML_AND_DIAGRAM_MANIFEST.md`; `uml/` |

Every status in the machine-readable manifest points back to one or more of these evidence groups.
