# Thesis and PPT changelog

## Word thesis

| Word section | Old/stale statement | New statement | Evidence source | Suggested figure/table |
|---|---|---|---|---|
| Ch. 3 — RAG retrieval | 36 queries are the final evaluation | 60 fixed retrieval cases: 59 scored + 1 control; Hit@1/3/5 88.14%/98.31%/100%; MRR 93.36% | `rag01-final` closure/summary | Retrieval dataset and metric table |
| Ch. 3/5 — generation quality | Structural checks represent answer quality; no baseline | Separate 27-task/54-output paired benchmark; RAG 23/27 vs Gemini-only 13/27 after source-bound owner review | `rag01-final` | Paired-outcome table: 10/0/13/4 |
| Ch. 3/4 — factual validation | Bạch Đằng 939 unresolved; heuristic warnings only | Two-layer bounded guard over 10 curated facts; max one repair; controlled failure | `rag02` reports | Runtime sequence/guard table |
| Ch. 4 — architecture | Retrieval → Gemini → generic validator | React/Cesium → Spring → FastAPI; Chroma retrieval + Gemini; bounded repair; factual guard + registry; Viettel TTS separate | Updated AI architecture/API docs | Updated component and sequence diagrams |
| Ch. 5 — timeline | Slider only/no exact-year input | Visible signed exact-year input; year zero; validation; URL/reload; live-range qualification | Map/timeline build-gate | Open/collapsed map screenshots |
| Ch. 5 — security | Broad “answers removed everywhere” claim | Six modes server-authoritative; no canonical leakage found in reviewed public artifacts | Exam-data/leak evidence | Authority/data-flow table |
| Ch. 5 — dashboard | AI/adaptive personalization | Rule-based weakness/developing recommendation; suppressed CTA for insufficient data | UI polish evidence | Recommendation-state screenshots |
| Ch. 5 — tests | Older totals (536/1186/1225/329/etc.) | FE 1232 PASS; BE 733 with 0 failures + 2 env errors + 87 skipped; AI 394 PASS + 3 deselected + 9 warnings | Final audit evidence | Three-domain test table |
| Ch. 5 — performance | 77.4% final improvement | Attempt worsened runtime behavior and was reverted; route lazy remains | PERF-01 correction | Decision/result table, no improvement chart |
| Ch. 6 — limitations | Generic future work | Preserve learner-study, provider, benchmark-size, 10-fact, provenance, GADM/license, performance limits | Final claim boundaries | Limitations matrix |

## PPT defense slides

| PPT slide/topic | Old/stale statement | New statement | Evidence source | Suggested figure/table |
|---|---|---|---|---|
| Contribution | AI is required for product value | Core-first/modular product; AI is supplementary | Product audit | Core vs optional module diagram |
| Map/timeline demo | Approximate slider navigation | Exact-year input, deterministic camera, sidebar alignment | Build-gate report | Two screenshots: open/collapsed |
| AI pipeline | RAG flow ends at generic validation | Add bounded repair, source/output guard and `critical_facts_v1` | RAG-02 | One sequence diagram |
| Retrieval results | 36-query headline | 60 cases; 59 scored + 1 control; exact metrics | RAG-01 | Four-metric bar/table |
| Generation comparison | No direct baseline | 27 paired tasks; 23/27 vs 13/27; +37.04 pp | RAG-01 | Paired outcome table |
| Reliability | “All tests pass” | Separate FE/BE/AI counts and disclose 2 Docker/Testcontainers errors | Final test audit | Compact three-column table |
| GIS | Historical boundaries | Modern 34-unit reference; not historical reconstruction; license unverified | GIS audit/current source | Disclaimer callout |
| Performance | 77.4% improvement | No safe meaningful improvement; reverted | PERF-01 correction | Revert decision card |
| Limitations/future | Minimal limitations | No learner study; provider dependency; fixed benchmark; 10 facts; provenance/GIS/perf limits | Final claim boundaries | Limitation/future-work matrix |

Use Vietnamese decimal commas in prose if required by the thesis style, but preserve exact underlying values. Do not round +37.04 percentage points into a relative-percent claim.
