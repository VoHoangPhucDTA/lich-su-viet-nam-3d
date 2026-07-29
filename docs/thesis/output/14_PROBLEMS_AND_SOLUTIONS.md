# 14 — Problems, impact and recommended resolution

| Problem/evidence | Impact | Safe resolution |
|---|---|---|
| Full frontend test script timed out | No full-suite verdict | Run in CI with longer timeout and capture report |
| ESLint: 19 errors, 5 warnings | Quality gate fails | Fix existing hooks/fast-refresh/unused/impure-code findings in a separate source change |
| Backend HistoryRagPackageReaderTest error: `data/history-rag/v1` absent | Backend suite not green | Restore or generate the approved package; do not invent a baseline |
| 15 Docker/Testcontainers tests skipped; Docker daemon unavailable | DB/AI integration unverified | Run with Docker and sanitized environment in CI |
| AI pytest missing from `ai-service/venv` | AI unit suite blocked | Install pinned dev requirements in an isolated environment, then rerun |
| No live MySQL comparison | `raw_json`/`sourceJson` parity unknown | Obtain read-only DB snapshot or approved environment |
| Terrain eligible coverage 37.67% | World-terrain claim must be conditional | Document unsupported nationwide/no_location behavior and choose demo records |
| Main frontend bundle >500 kB chunks | Performance risk | Measure production network budget and split lazy routes/assets |
| Ten Word image placeholders | Ch5 lacks visual evidence | Capture approved screenshots using the supplied checklist |
| No RAG precision/grounding run | Quality claims unsubstantiated | Add reproducible evaluation corpus, metrics and provenance report |
| Legacy thesis names LangChain/FPT.AI | Architecture mismatch | Rewrite to current custom pipeline/Google GenAI/Chroma and Viettel AI, or label history |

No production code or source data was changed to mask any of these findings.
