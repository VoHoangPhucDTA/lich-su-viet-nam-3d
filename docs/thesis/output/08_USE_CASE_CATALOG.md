# 08 — Use-case catalog

| ID | Use case | Actor | Classification | Evidence |
| --- | --- | --- | --- | --- |
| UC-001 | Browse/search/filter historical events | Visitor | IMPLEMENTED_NOT_RUNTIME_VERIFIED | AllEventsPage; EventController |
| UC-002 | View event detail and sources | Visitor | IMPLEMENTED_NOT_RUNTIME_VERIFIED | EventController; event detail route |
| UC-003 | Explore event hierarchy/drill-down | Visitor | IMPLEMENTED_NOT_RUNTIME_VERIFIED | children endpoint; MapPage/EventPopup |
| UC-004 | Select map target | Visitor | IMPLEMENTED_AND_VERIFIED (tests) | terrainTargets tests |
| UC-005 | Enter and exit terrain mode | Visitor | IMPLEMENTED_AND_VERIFIED (tests/static) | MapPage; CesiumMap; toolbar tests |
| UC-006 | Register/login/verify account | Student | IMPLEMENTED_NOT_RUNTIME_VERIFIED | AuthController; protected routes |
| UC-007 | Listen to event narration | Student | PARTIALLY_IMPLEMENTED | NarrationController; Viettel provider |
| UC-008 | Generate and answer AI quiz | Student | PARTIALLY_IMPLEMENTED / RUNTIME UNVERIFIED | AiQuizController; FastAPI |
| UC-009 | Take exam and submit receipt | Student | IMPLEMENTED_NOT_RUNTIME_VERIFIED | ExamSession/Submission controllers |
| UC-010 | Review progress/dashboard | Student | IMPLEMENTED_NOT_RUNTIME_VERIFIED | ProgressController; profile routes |
| UC-011 | Administer users/events | Administrator | IMPLEMENTED_NOT_RUNTIME_VERIFIED | AdminController |
| UC-012 | Review AI candidate provenance | Administrator/reviewer | IMPLEMENTED_NOT_RUNTIME_VERIFIED | AiCandidateController; V35–V37 |
| UC-013 | Run production RAG evaluation | Operator | PLANNED / NEEDS MEASUREMENT | No evaluation artifact found |

The pre-audit nine use-case files are backed up under `legacy-usecase/`. Updated current-system PlantUML is in `uml/` and the permitted `usecase/` update.
