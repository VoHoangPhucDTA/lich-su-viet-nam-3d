# Final product and AI test audit

## Frontend

| Gate | Final accepted result |
|---|---:|
| Test files | 135/135 PASS |
| Tests | 1232/1232 PASS |
| Lint | PASS |
| TypeScript | PASS |
| Vite production build | PASS |
| `npm run build` | PASS |

The earlier build block was `TRANSIENT_REPO_LOCAL_VITE_PROCESS_HANDLE_CONDITION`: a verified Vite tree on port 5173 held generated exam metadata. Stopping only that process tree unblocked the build; no generator workaround was added.

## Backend

| Gate | Final accepted result |
|---|---:|
| Compile | PASS |
| Focused final audit | 47/47 PASS |
| Full suite tests run | 733 |
| Assertion failures | 0 |
| Environment/Testcontainers errors | 2 |
| Skipped | 87 |

The Maven full-suite command was nonzero solely because Docker/Testcontainers was unavailable for two startup tests. This is not represented as 733/733 PASS and is not an application assertion failure.

## AI/RAG automated regression

| Gate | Result |
|---|---:|
| `tests/test_rag01.py` | 33 PASS |
| Focused RAG-02 | 24 PASS |
| Full offline AI suite | 394 PASS, 3 deselected, 9 warnings |
| Ruff | PASS |
| Provider calls during final offline gate | 0 |

## Evaluation benchmark

Retrieval and generation are different experiments:

| Measure | Result |
|---|---:|
| Retrieval cases | 60 |
| Ordinary scored | 59 |
| Insufficient-context control | 1 |
| Hit@1 | 88.14% |
| Hit@3 | 98.31% |
| Hit@5 | 100% |
| MRR | 93.36% |
| Legacy 36-query reproducibility | PASS |
| Paired generation tasks | 27 |
| Generated outputs | 54 |
| RAG semantic PASS | 23/27 (85.19%) |
| Gemini-only semantic PASS | 13/27 (48.15%) |
| Absolute difference | +37.04 percentage points |
| Paired outcomes | 10 RAG wins; 0 Gemini wins; 13 both pass; 4 both fail |

The exact paired p-value `0.001953125` is exploratory for this fixed small benchmark, not population-level proof.

## Security/exam data

- Six exam modes are server-authoritative.
- Exam-data verification: 3/3 PASS.
- Reviewed public-artifact answer-key leak search: PASS.
- Safe wording: “No canonical answer-key leakage was found in the reviewed public artifacts.”
- `authVersion`: password change/reset invalidates old tokens on the next protected authentication request; it is not instantaneous push logout.

## Performance

- Route-level lazy loading remains.
- The nested-lazy Cesium attempt made runtime behavior worse and was reverted.
- Final status: `NO_SAFE_MEANINGFUL_IMPROVEMENT_REVERTED`.
- Historical 77.4% bundle figures are not final accepted product-improvement evidence.

## Evidence anchors

- `docs/review/fix-teacher/rag01-final/`
- `docs/review/fix-teacher/rag02/`
- `docs/review/fix-teacher/map-timeline-ui-build-gate/`
- Earlier backend/freeze reports remain historical; the reconciled accepted backend totals above preserve the Docker/Testcontainers caveat.
