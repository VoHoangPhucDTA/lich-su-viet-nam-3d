# AI Experimental Evaluation

Document status: engineering baselines recorded; **Teacher evaluation: NOT YET COLLECTED**. Every teacher-result cell remains `TBD — awaiting teacher evaluation` until validated human reviews exist.

## 1. Experimental objective

Evaluate a source-grounded Vietnamese History question-generation pipeline at three distinct levels: retrieval of eligible textbook chunks, structural/provenance quality of generated questions, and independent teacher judgment. Engineering checks constrain format and traceability; they do not establish absolute historical truth.

## 2. Locked research questions

- RQ1: Does retrieval return the relevant SGK passage within top-k?
- RQ2: Do generated questions satisfy the structure and source-traceability contract?
- RQ3: How do teachers assess factual correctness, clarity, distractors, explanations, difficulty, and pedagogical usefulness?
- RQ4: How do heuristic warnings correspond to issues identified by teachers?
- RQ5: Is observed latency suitable for an interactive practice-generation workflow?

No answer to RQ3 or RQ4 is asserted before real teacher data is collected.

## 3. Hardware and software environment

Record the evaluation machine CPU, RAM, storage, OS/build, Docker version, Python version, Java/JDK, Node/npm, browser, execution date/timezone, network conditions, and Gemini API/model release visible at execution. Pin Python dependencies and record the Git commit. Current development evidence was obtained on Windows/PowerShell; local measurements are not production SLO measurements.

| Environment field | Recorded value |
| --- | --- |
| Git commit | Captured in `sample-manifest.json` at execution |
| Python/application dependencies | Repository lock/requirements files |
| Hardware, OS, network | Record at real run time |
| Evaluation timezone | Asia/Saigon |

## 4. Corpus and pending-review exclusion

The corpus has 459 chunks: 414 production-eligible and 45 pending-review chunks excluded from production retrieval. Evaluation records corpus SHA-256 and detects pending-review leakage. The selected scope is the Kết nối tri thức History corpus for grades 10–12; it is not a general historical knowledge base.

## 5. Embedding and vector database

The locked configuration is `gemini-embedding-2`, 768 dimensions, Chroma collection `sgk_kntt_history_gemini_v1`, cosine distance, and 414 indexed production records. A sample identity records model, dimension, collection, and corpus hash without storing embedding vectors or credentials.

## 6. Retrieval benchmark

The existing fixed benchmark reports Strict Chunk Hit@1 = 0.888889, Strict Chunk Hit@3/5 = 1.0, MRR = 0.944444, filter compliance = 1.0, pending-review leakage = 0, and duplicate/empty results = 0. These are engineering-benchmark outcomes created by the development team and must not be generalized to unseen curricula.

| Retrieval metric | Engineering result |
| --- | ---: |
| Strict Chunk Hit@1 | 0.888889 |
| Strict Chunk Hit@3 | 1.0 |
| Strict Chunk Hit@5 | 1.0 |
| MRR | 0.944444 |
| Filter compliance | 1.0 |
| Pending-review leakage | 0 |
| Duplicate/empty result | 0 |

## 7. Generation benchmark

The locked production generation identity is `gemini-2.5-flash`, temperature 0.3, prompt `grounded-mcq-v1`, and schema `grounded-mcq-schema-v1`. The current 12-request engineering run succeeded 12/12; schema/source metrics were 1.0; duplicate, partial, and insufficient-context rates were 0. Twenty-two generated questions received conservative heuristic manual-review warnings. A warning is not evidence of factual error.

| Generation structural metric | Engineering result |
| --- | ---: |
| Successful requests | 12/12 |
| Schema/source contract rates | 1.0 |
| Duplicate rate | 0 |
| Partial response rate | 0 |
| Insufficient-context rate | 0 |
| Heuristic manual-review flags | 22 questions |

## 8. Teacher evaluation protocol

Follow `docs/ai-service/AI_TEACHER_EVALUATION_PROTOCOL.md`. Teachers work independently with pseudonymous IDs, score blinded static packages, see the proposed answer/explanation/source only after first reading the item, and return a validated CSV. Ratings never feed automatic candidate approval or publication. This document makes no claim of institutional ethics approval.

## 9. Sample selection

Manifest `teacher-evaluation-v1` fixes 36 requests before ratings: 12 per grade 10/11/12 and, within each grade, four EASY, four MEDIUM, and four HARD. It uses three requests derived from every one of the 12 benchmark cases and covers event/time, cause, development, result, significance, person, comparison, and assessment. Generation failures remain outcomes and are not silently replaced. A changed experiment receives a new manifest version.

## 10. Rubric and decisions

Eight 1–5 criteria are historical factual correctness, grounding/source consistency, question clarity, single-answer unambiguity, distractor quality, explanation quality, difficulty appropriateness, and pedagogical usefulness. Independent critical-issue flags describe concrete defects. Overall decisions are accept as-is, accept with minor edit, requires major edit, and reject. Full anchors and definitions are in the protocol.

## 11. Metrics and confidence intervals

For every criterion report N, mean, median, sample standard deviation, minimum, maximum, distribution 1–5, and rating-at-least-4 rate; split by grade, requested difficulty, content category, and evaluator. Report each overall decision rate plus any-critical-issue, factual-error, unsupported-source, ambiguity, multiple/no-correct-answer, and difficulty-mismatch rates. Binary rate intervals use two-sided Wilson 95% intervals and always show N. High averages do not prove absolute factual correctness.

## 12. Inter-rater agreement

One evaluator: do not compute agreement. Two evaluators: exact and adjacent agreement and quadratic-weighted Cohen kappa per ordinal criterion; Cohen kappa for the binary any-critical-issue indicator when defined. Three or more: use the implementation's all-pairs, available-case method, explicitly report every common-item N, and omit missing evaluator-item pairs. Report rating distributions and avoid interpreting kappa in isolation.

## 13. Latency methodology

Measure retrieval and generation wall-clock latency separately where instrumentation permits; distinguish provider calls from generation-cache hits, record warm-up policy and failures, and report N/mean/median/P95/min/max. Do not combine cache-hit and cache-miss latency without labeling. Local development timings and smoke samples are not production latency or an SLO. RQ5 requires the actual controlled-run table below.

## 14. Reproducibility

The runtime identity manifest must contain Git commit, corpus SHA, embedding model/dimension, collection name, generation model, prompt version, schema version, evaluation-manifest version, generation temperature, and generation cache identities. It excludes secrets, JWTs, full prompts, and vectors.

PowerShell from repository root:

```powershell
cd D:/KLTN/lich-su-viet-nam-3d/ai-service
python -m scripts.build_teacher_evaluation_sample --offline-preflight
# Only after cost/quota approval:
python -m scripts.build_teacher_evaluation_sample --execute --allow-provider-call
cd ..
python scripts/evaluation/export_teacher_review.py --sample artifacts/teacher-evaluation/sample.jsonl --output-dir artifacts/teacher-evaluation/GV01 --evaluator-id GV01 --seed '<controlled-study-seed>'
python scripts/evaluation/import_teacher_reviews.py --sample artifacts/teacher-evaluation/sample.jsonl --reviews '<approved-path>/teacher-reviews.csv' --output-dir artifacts/teacher-evaluation
python scripts/evaluation/analyze_teacher_reviews.py --sample artifacts/teacher-evaluation/sample.jsonl --reviews artifacts/teacher-evaluation/results/teacher-reviews.jsonl --output-dir artifacts/teacher-evaluation
```

POSIX shell equivalent:

```sh
cd ai-service
python -m scripts.build_teacher_evaluation_sample --offline-preflight
# Only after cost/quota approval:
python -m scripts.build_teacher_evaluation_sample --execute --allow-provider-call
cd ..
python scripts/evaluation/export_teacher_review.py --sample artifacts/teacher-evaluation/sample.jsonl --output-dir artifacts/teacher-evaluation/GV01 --evaluator-id GV01 --seed '<controlled-study-seed>'
python scripts/evaluation/import_teacher_reviews.py --sample artifacts/teacher-evaluation/sample.jsonl --reviews '<approved-path>/teacher-reviews.csv' --output-dir artifacts/teacher-evaluation
python scripts/evaluation/analyze_teacher_reviews.py --sample artifacts/teacher-evaluation/sample.jsonl --reviews artifacts/teacher-evaluation/results/teacher-reviews.jsonl --output-dir artifacts/teacher-evaluation
```

An exported review package is fully offline and requires no Gemini key.

## 15. Threats to validity

- The sample covers only the selected SGK and grade 10–12 scope.
- The number of teachers may be small.
- The rubric includes subjective judgment.
- The teacher sample may not represent all users.
- The engineering benchmark was created by the development team.
- The model/API may change over time.
- Gemini output is stochastic even with a fixed configuration.
- Source provenance is not equivalent to absolute factual correctness.
- Local latency is not production latency.
- Some runtime/research artifacts are stored outside the repository.

Additional selection, learning, fatigue, ordering, and missing-review effects must be discussed from the actual collection log. Deterministic per-evaluator order reduces but does not eliminate ordering effects.

## 16. Ethical and privacy considerations

Store only `GVxx` pseudonyms in repository-compatible artifacts. Keep real identity mappings, consent records, and approved retention/withdrawal records outside Git. Do not collect names, email, phone, or unnecessary demographics in the review form. Do not claim ethics approval unless it exists, and do not use teacher ratings to auto-publish content.

## 17. Limitations

Structural validators can confirm schema, source-ID membership, and reproducible identity, not historical truth. Supplied textbook excerpts may be incomplete. A 36-item sample and a small evaluator pool limit external validity. Pairwise agreement for three or more evaluators is transparent and missing-aware but is not a single multi-rater coefficient. Warning correlation depends on the locked majority definition and adequate paired reviews.

## 18. Result templates

All CSV equivalents are produced under `artifacts/teacher-evaluation/tables/` only after validated real reviews. Until then:

| Teacher rubric criterion | N | Mean | Median | SD | Min | Max | >=4 | Distribution 1–5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All eight criteria | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation |

| Overall decision | Count/rate | Wilson 95% CI |
| --- | --- | --- |
| ACCEPT_AS_IS / MINOR / MAJOR / REJECT | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation |

| Critical issue metric | Rate | Wilson 95% CI |
| --- | --- | --- |
| Any / factual / unsupported / ambiguity / multiple-or-none / difficulty mismatch | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation |

| Agreement | Common-item N | Value |
| --- | --- | --- |
| Exact / adjacent / weighted kappa / binary kappa | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation |

| Warning comparison | Issue | No issue |
| --- | --- | --- |
| Warning / no warning | TBD — awaiting teacher evaluation | TBD — awaiting teacher evaluation |

| Latency/failure metric | N | Mean/median/P95/min/max or rate |
| --- | --- | --- |
| Retrieval, generation cache hit/miss, generation failure | Record at controlled sample run | Record at controlled sample run |

## 19. Updating after collection

1. Archive the locked sample manifest/hash and research-approved raw CSV outside Git.
2. Import without correction; resolve reported errors in the source form and re-import.
3. Confirm validation status PASSED and zero PII before analysis.
4. Run analysis once against the validated JSONL; preserve generated JSON, Markdown, and CSV tables as controlled runtime artifacts.
5. Replace only teacher placeholders with observed values, N, intervals, and limitations. Never insert synthetic fixture results.
6. Record missing data, deviations, evaluator count, collection dates, and protocol/manifest version.
7. Keep low-rated and failed items; create v2 only for a separately documented iteration.
