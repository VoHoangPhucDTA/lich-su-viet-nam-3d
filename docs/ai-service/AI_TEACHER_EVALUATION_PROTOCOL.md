# AI Teacher Evaluation Protocol

Status: tooling complete; **Teacher evaluation: NOT YET COLLECTED**. Protocol version: `teacher-evaluation-v1`.

## 1. Purpose and boundary

This protocol evaluates generated History MCQs through independent teacher judgment. It measures historical factual correctness, consistency with supplied textbook evidence, clarity, answer uniqueness, distractors, explanation, requested difficulty, and pedagogical usefulness. It does not prove absolute factual correctness, does not claim an absence of hallucination, and is independent of candidate approval and publication. A rating or decision never triggers save, approval, or publish.

No new model, prompt, retrieval method, corpus source, or business workflow may be introduced during v1. Items may not be removed or regenerated after viewing ratings. A technical defect must be recorded; any changed experiment uses a new manifest version while v1 remains available.

## 2. Participants and privacy

The intended evaluators are teachers qualified to assess Vietnamese History material for grades 10–12. Use only repository-safe pseudonyms `GV01`, `GV02`, and so on. Never put names, email addresses, phone numbers, or other identity mappings in Git or runtime result files. If identity linkage is required by the thesis process, the researcher stores it outside Git under the applicable institutional process.

This document does not represent or imply institutional ethics approval. Before involving people, the thesis author must follow the institution's consent, ethics, privacy, retention, and withdrawal requirements.

## 3. Fixed sample and selection

The immutable request manifest is `ai-service/data/evaluation/teacher_evaluation_manifest.jsonl`. Version v1 contains 36 requests: 12 per grade, with exactly four EASY, four MEDIUM, and four HARD requests in each grade. Categories are EVENT_TIME, CAUSE, DEVELOPMENT, RESULT, SIGNIFICANCE, PERSON, COMPARISON, and ASSESSMENT. Three requests are derived from each of the 12 locked generation benchmark cases. Selection occurs before teacher ratings and is not conditioned on attractive model output.

Generation uses the current production contract and fixed identity: production-eligible corpus, `gemini-2.5-flash`, `grounded-mcq-v1`, `grounded-mcq-schema-v1`, temperature 0.3, and valid cache identity. Cache hits are reused. A cache miss calls the provider only with explicit `--allow-provider-call`; there is no unbounded retry. Failures stay in the sample-generation report and are not silently replaced.

The sample manifest records Git commit, corpus SHA-256, embedding model/dimension, collection, generation model, prompt/schema versions, evaluation-manifest version, generation temperature, and generation cache identities. It never records a key, JWT, raw prompt, or vector.

## 4. Randomization and blinded review

Each evaluator receives a deterministic permutation derived from the study seed and evaluator pseudonym. The package stores display-order mapping and a SHA-256 identity of the seed, not the seed itself, so a controlled research record can reproduce the order. Different evaluators may have different orders.

The package initially shows the question and four options. The teacher scores the item before opening the collapsible answer/evidence section. That section exposes the proposed answer, explanation, and relevant SGK excerpts. The package hides model name, warning, latency, repair count, source distance, and candidate status. It is a static offline HTML document with no backend or CDN dependency; generated text is HTML-escaped.

## 5. Rubric (one score from 1 to 5 per criterion)

The common anchors are: 1 = serious failure; 2 = material problems; 3 = broadly acceptable but problematic; 4 = good/correct; 5 = fully meets the criterion with exceptional clarity. Apply these criterion-specific meanings:

| Code | Criterion | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| A | Historical factual correctness | Seriously false | Material factual error | Broadly correct with a problem | Correct | Completely accurate and clear |
| B | Grounding/source consistency | Contradicts source | Mostly unsupported | Partially supported | Supported | Fully and directly supported |
| C | Question clarity | Unusable/unclear | Material ambiguity | Understandable with issue | Clear | Exceptionally precise |
| D | Single-answer unambiguity | No defensible answer | Multiple plausible answers | Intended answer inferable but weak | One clear answer | One uniquely demonstrated answer |
| E | Distractor quality | Invalid set | Mostly implausible/gives away answer | Mixed quality | Plausible | Strong, balanced distractors |
| F | Explanation quality | Incorrect | Material omission/error | Adequate with issue | Correct and useful | Complete, concise, student-appropriate |
| G | Difficulty appropriateness | Completely mismatched | Material mismatch | Borderline | Matches request | Clearly calibrated to grade/request |
| H | Pedagogical usefulness | Harmful/unusable | Major revision needed | Usable with revision | Useful | Highly useful for review/learning |

Ratings must remain integers 1–5. Missing or out-of-range values fail import and are never corrected automatically.

## 6. Critical issues and comments

Select zero or more neutral issue codes: `FACTUAL_ERROR`, `UNSUPPORTED_BY_SOURCE`, `MULTIPLE_CORRECT_OPTIONS`, `NO_CORRECT_OPTION`, `AMBIGUOUS_WORDING`, `WEAK_DISTRACTORS`, `INCORRECT_EXPLANATION`, `DIFFICULTY_MISMATCH`, `INAPPROPRIATE_FOR_GRADE`, `SOURCE_MISMATCH`, or `OTHER`. Separate multiple CSV codes with semicolons. Use the comment for concise evidence, especially for `OTHER`; never enter personal data. The form deliberately does not ask the teacher to label “AI hallucination.”

## 7. Overall decision

- `ACCEPT_AS_IS`: usable without content editing.
- `ACCEPT_WITH_MINOR_EDIT`: core answer/evidence is sound; small wording or distractor edits suffice.
- `REQUIRES_MAJOR_EDIT`: the learning objective may be retained, but substantial content correction is required.
- `REJECT`: unsafe or unsuitable to use as this question.

These are study labels only. They do not authorize official publication.

## 8. Review session procedure

1. Researcher exports one package per evaluator using the locked sample, evaluator ID, and controlled seed.
2. Evaluator confirms the displayed pseudonym and works independently without seeing other ratings.
3. For each item, read question/options first; then open answer, explanation, and source evidence.
4. Complete all eight scores, one overall decision, zero or more issue codes, and optional non-PII comment.
5. Return only the CSV through the researcher's approved channel. The researcher imports it without manual correction.

Budget approximately 2–4 minutes per item plus orientation: roughly 90–150 minutes for 36 items, with breaks allowed. Record actual session timing outside the review form only if permitted; do not infer it from generation latency.

## 9. Validation, disagreement, and missing data

Import rejects unknown item/evaluator IDs, duplicates, wrong sample/question hashes, missing or invalid scores, decisions, and issue codes. Invalid rows are reported and not normalized. The researcher asks the evaluator to correct the source form; the script never guesses a correction.

With one evaluator, agreement is not computed. With two, report exact and adjacent agreement plus quadratic-weighted Cohen kappa for every ordinal criterion and Cohen kappa for the binary any-critical-issue flag, always with common-item N. With three or more, the locked implementation reports all available evaluator pairs and omits only missing pairs; it records this dependency-free, missing-aware pairwise method rather than collapsing scores. Do not interpret kappa without N and score distributions. Disagreement is retained, not adjudicated into a fabricated consensus; any later adjudication must be a separate, documented dataset.

## 10. Warning comparison and reporting

Before results, the warning contract is fixed as warning-present versus majority any-critical-issue among items with at least two reviews. Report the four confusion cells, precision, recall, false-positive rate, and false-negative rate only when eligible data exists. A heuristic warning is not itself a factual error, and thresholds may not be tuned after inspecting v1 and then described as pre-registered.

Results remain under ignored `artifacts/teacher-evaluation/results/`. Reports state sample size and limitations, contain no PII, and do not generalize beyond evaluated items. UX findings require item-level evidence, affected items, severity, proposed change, expected benefit, risk, and whether code is required. Cosmetic redesign waits for evidence; only security, incorrect display/mapping, or evaluation-blocking defects justify immediate repair.

## 11. Version control

The v1 request manifest is immutable once generation begins. Any change to selection, query, category, model, prompt, schema, or replacement policy creates `teacher-evaluation-v2` with a written reason. Preserve v1 sample identity and failures for comparison. Never remove a low-rated item, alter expected output, or rerun only undesirable items and substitute the result.
