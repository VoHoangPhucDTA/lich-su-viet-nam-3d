# Exam Database Implementation Progress

## Goal 1

Implement Phase 1 and Phase 2 of the MySQL/TiDB-compatible exam question bank architecture.

- Phase 1: versioned question bank, deterministic dataset build, validated staging import, and atomic active-dataset promotion.
- Phase 2: public catalog, topic metadata, exam metadata detail, and custom-exam preview APIs.
- Deferred: server-issued sessions, backend scoring, immutable attempt snapshots, frontend API-first migration, and recovery flows.

## Goal 2

Implement Phase 3 and Phase 4 of the server-backed exam architecture while retaining
the static frontend flow as the current production fallback.

- Phase 3: server-issued sessions, anonymous session capability tokens, resume,
  practice check, and practice completion.
- Phase 4: backend-scored timed/mock submission, immutable result snapshots, and
  receipt-backed idempotency.
- Still deferred: frontend API-first migration, client recovery queue and recovery
  endpoints, server-time UI wiring, and production TiDB end-to-end deployment.

## Phase 1 - Versioned Question Bank

### Database

Migration `V14__versioned_exam_question_bank.sql` creates:

- `exam_datasets`
- `exam_import_runs`
- `exam_runtime_state`
- `exam_definitions`
- `exam_sections`
- `exam_questions`
- `exam_mcq_options`
- `exam_tf_statements`
- `exam_question_sources`
- `exam_topics`
- `exam_question_topics`

The migration does not modify `V13__exam_v2_attempts.sql`, `exam_v2_attempts`, `exam_attempts`, or `exam_answers`.

Database-enforced invariants include dataset-scoped exam and question IDs, exam-scoped section IDs and order, section-scoped question order, option/statement keys, ownership foreign keys, and visibility/verification value checks. The cross-table invariant that a question's `dataset_id` matches the dataset owning its section is audited by the importer before promotion because the baseline deliberately avoids composite foreign keys.

`utf8mb4_unicode_ci` is used by V14 so the new schema remains portable across MySQL, TiDB-compatible deployments, and the local MariaDB smoke-test engine.

### Deterministic Build

- Node canonicalization: `canonicalize@3.0.0`.
- Java canonicalization: `io.github.erdtman:java-json-canonicalization:1.1`.
- Shared RFC 8785 fixtures: `data/exam-build-fixtures/rfc8785-vectors.json`.
- Raw JSON is rejected for BOM, malformed syntax, or duplicate object properties before normal parsing.
- Sources are sorted by normalized relative path and canonicalized before SHA-256 hashing.
- The three generated artifacts are canonicalized and hashed independently.
- `buildId`, `generatedAt`, absolute paths, and `exam-dataset-build.json` itself do not participate in the aggregate hash.

Current deterministic aggregate hash:

```text
9256b19fa10cbcad797a3795ebd3f43f52e6b986eedea7c31e812cee10242b94
```

Two consecutive builds produced the same aggregate hash while audit timestamps/build IDs changed.

### Importer

The `import-exams` Spring profile provides a dry-run-by-default command runner. The importer:

1. Recomputes and validates all source, artifact, and aggregate hashes.
2. Validates manifest, topic index, raw-topic mapping, question shapes, IDs, option/statement keys, and counts.
3. Writes a complete dataset with status `STAGING` in one transaction.
4. Audits rows, mappings, ownership, and orphan conditions.
5. Marks the dataset `VALIDATED`.
6. Promotes the active pointer in a short independent transaction and supersedes the prior active dataset.
7. Returns `SKIPPED` without mass updates when the aggregate hash already exists.

Promotion failures retain the validated dataset and a linked failed import audit. A blocking validation failure does not alter the active pointer.

## Phase 2 - Metadata APIs

Implemented anonymous public endpoints:

- `GET /api/exams`
- `GET /api/exams/{examId}`
- `GET /api/exams/topics`
- `POST /api/exams/custom/preview`

All queries are scoped to the active dataset. Public APIs always filter `visibility_status = PUBLIC`; the default catalog additionally filters `verification_status = VERIFIED`, while the reviewable view may include `REVIEW_REQUIRED` public exams.

DTO allowlists return metadata, counts, normalized preview configuration, availability, breakdowns, warnings, and dataset version only. They do not expose question text, question references, answer keys, correctness flags, or explanations. Existing `/api/exams/attempts` authentication rules remain in place.

## Files Changed

### Backend

- `backend/pom.xml`
- `backend/src/main/resources/db/migration/V14__versioned_exam_question_bank.sql`
- `backend/src/main/java/com/lichsuvn/backend/exam/dataset/**`
- `backend/src/main/java/com/lichsuvn/backend/exam/catalog/**`
- `backend/src/main/java/com/lichsuvn/backend/common/config/SecurityConfig.java`
- `backend/src/test/java/com/lichsuvn/backend/BackendApplicationTests.java`
- `backend/src/test/java/com/lichsuvn/backend/exam/**`

### Frontend/Data Build

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/scripts/build-exams-manifest.mjs`
- `frontend/scripts/build-topic-index.mjs`
- `frontend/scripts/build-exam-dataset.mjs`
- `frontend/scripts/lib/strictJson.mjs`
- `frontend/scripts/lib/examDatasetBuild.mjs`
- `frontend/scripts/__tests__/exam-dataset-build.node-test.mjs`
- `frontend/public/data/exams/exam-dataset-build.json`
- `data/exam-build-fixtures/rfc8785-vectors.json`

### Documentation

- `docs/progress/EXAM_DB_IMPLEMENTATION_PROGRESS.md`

Pre-existing worktree changes outside this list were not reverted, overwritten, staged, or committed.

## Validation Results

### Dataset Audit

| Metric | Result |
|---|---:|
| Source exams | 38 |
| Sections | 76 |
| Questions | 1,064 |
| Canonical topics | 32 |
| Question-topic taggings | 1,092 |
| Dataset/section mismatch | 0 |
| Active dataset pointers | 1 |

### Build and Tests

| Check | Result |
|---|---|
| `npm run test:exam-data` | PASS, 3/3 |
| `npm run test:run` | PASS, 12 files / 45 tests |
| `npm run build:data` | PASS |
| Two-build deterministic hash comparison | PASS |
| `npm run build` | PASS |
| `./mvnw test` | PASS, 8 suites / 21 tests |
| `./mvnw -DskipTests package` | PASS |
| V14 SQL on isolated MariaDB | PASS, 11 tables and expected constraints |
| Import/promote on isolated MariaDB | PASS, dataset `ACTIVE` with audited counts |
| HTTP catalog smoke test on imported DB | PASS: 23 verified public exams, 32 topics, preview HTTP 200, no answer-key fields |
| Existing attempts endpoint remains protected | PASS, anonymous HTTP 401 |

The local MariaDB 10.4 engine cannot apply the repository's full V1-V14 chain because the already-applied V1 migration uses MySQL 8-only `utf8mb4_0900_ai_ci`. V14 itself was run directly and successfully on an isolated database. No migration was run against the configured remote TiDB database.

## Acceptance Criteria

- [x] Versioned question bank schema implemented without changing V13.
- [x] Deterministic RFC 8785 build and metadata artifact implemented.
- [x] Duplicate raw JSON properties rejected before normal parsing.
- [x] Node/Java canonicalization parity covered by shared fixtures.
- [x] Import dry-run, staging, validation, atomic promote, failed-promote retention, and repeat-hash `SKIPPED` covered by tests.
- [x] Real SQL-engine V14 and importer smoke tests passed on an isolated database.
- [x] Catalog, detail, topics, and custom preview APIs implemented against the active dataset.
- [x] Hidden/reviewable policies and answer-key leakage tests passed.
- [x] Frontend data build and backend test/package gates passed.
- [x] No files staged, committed, or pushed by this goal.

## Rollback

1. Do not activate the `import-exams` profile to disable importer execution; its default mode is dry-run.
2. Keep all existing static exam JSON and frontend loaders available during this phase; no frontend API-first switch was made.
3. To roll back imported content, transactionally lock `exam_runtime_state`, point `active_dataset_id` to the prior retained dataset, mark that dataset `ACTIVE`, and mark the reverted dataset `SUPERSEDED`.
4. Do not drop old datasets while active sessions/recovery support remains deferred and retention policy is not implemented.
5. Do not edit or roll back applied Flyway migrations manually. Any production schema correction must use a new migration.

## Phase 3 - Server-Issued Sessions and Practice

### Database

Migration `V15__exam_sessions_and_submission_receipts.sql` adds:

- `exam_sessions`, which pins the source dataset, mode, question-set configuration,
  server start/deadline, scoring version, ownership, and lifecycle state;
- `exam_session_questions`, which stores separate safe and answer-key snapshots for
  each issued question instance; and
- `exam_submission_receipts`, the sole idempotency and recovery-status record for
  submissions.

Session states are `IN_PROGRESS`, `COMPLETED`, `SUBMITTED`, `EXPIRED`, and
`CANCELLED`. The supported modes are `TIMED_ORIGINAL`, `CUSTOM_MOCK`,
`FREE_PRACTICE`, `TOPIC_PRACTICE`, `RETRY_WRONG`, and `CUSTOM_PRACTICE`.

Anonymous sessions receive a high-entropy opaque token only at creation. The database
stores its SHA-256 hash; subsequent resume/check/complete/submit requests must send the
raw token through `X-Exam-Session-Token`. The raw token is neither returned by resume
nor stored in result snapshots or attempts. Authenticated owners use their principal
instead of an anonymous token.

### APIs

Implemented routes:

- `POST /api/exam-sessions`
- `GET /api/exam-sessions/{sessionId}`
- `POST /api/exam-sessions/{sessionId}/questions/{questionInstanceId}/check`
- `POST /api/exam-sessions/{sessionId}/complete`
- `POST /api/exam-sessions/{sessionId}/submit`

The create route issues a fixed question set from the active dataset. Resume returns
safe question snapshots and only returns result/explanation data for practice questions
already checked. It never exposes answer keys for unchecked questions.

Practice check requires one MCQ answer or all true/false statements. A checked answer is
locked: a retry with the same normalized answer returns the cached result, while a
different answer is rejected. Checking the final unanswered practice question completes
the session automatically. `complete` is idempotent, is restricted to practice modes,
marks unchecked questions as untouched in the summary, and never creates an
`exam_v2_attempts` row.

`RETRY_WRONG` reconstructs questions from an immutable snapshot-schema-v2 prior result.
Legacy attempt payloads are rejected with a clear unsupported-source error rather than
silently loading a changed current dataset.

## Phase 4 - Backend-Scored Submit and Immutable Attempts

### Migration and Authority Metadata

Migration `V16__exam_v2_attempt_snapshot_authority.sql` appends, without editing V13:

- `snapshot_schema_version`
- `score_authority`
- `timing_authority`
- `submission_origin`
- `scoring_version`
- `dataset_version`
- `exam_content_hash`

For on-time server-issued timed/mock submissions, the stored authority is
`BACKEND` / `SERVER` / `SERVER_ON_TIME`. Legacy `POST /api/exams/attempts` cannot
overwrite an attempt marked `score_authority = BACKEND`.

### Submission Contract and Scoring

Timed original and custom mock submission accepts an exact complete map of issued
question-instance IDs. MCQ `selected: null` is a valid blank answer. True/false values
may be `true`, `false`, or `null` per statement, so partial true/false answers are valid
submissions rather than malformed payloads. Unknown, missing, duplicate-normalized, or
wrong-type instances are rejected.

Server scoring matches the established frontend rules:

- original exams: MCQ `.25`; true/false ladder `0`, `.1`, `.25`, `.5`, `1` by
  statement count;
- custom mocks: one unit for a correct MCQ and fractional units for true/false, scaled
  to 10.

The result is persisted as immutable snapshot schema v2. Each reviewed question keeps
the safe prompt/options or statements, submitted answer, correct answer at submit time,
correctness, score, completion state, explanation, sources, topics, scoring version,
and dataset/content hashes. Result/history/retry must use this snapshot rather than
joining the current question bank for historic review.

### Receipt Idempotency and Race Safety

`exam_submission_receipts` is the only source of truth for client submission IDs,
canonical request hash, status/error code, and the linked official attempt. Attempts do
not duplicate client ID or submission hash.

The service first writes or locks a receipt in an independent transaction, then locks the
session row before scoring. The unique `client_submission_id` prevents a retry from
creating another receipt, while `(session_id, success_slot)` allows many non-successful
receipts but permits only one successful submission per session. A request with the same
canonical hash returns the stored result; a changed payload conflicts. Concurrent
different client IDs can therefore not create two successful attempts. Backend attempts
are write-once.

Submission after the configured grace period is rejected as retryable and does not create
an official timed attempt. Recovery endpoints and the frontend recovery queue remain
explicitly deferred; no late/static fallback attempt is misrepresented as an on-time
server-timed attempt in this goal.

## Goal 2 Validation Results

| Check | Result |
|---|---|
| `ExamSessionServiceIntegrationTest` | PASS, 7/7 |
| Goal 1 dataset/catalog regression selection | PASS, 10/10 |
| `./mvnw test` | PASS, 28/28 |
| Direct V15/V16 SQL smoke on isolated MariaDB 10.4 | PASS |
| Two non-success receipt slots per session | PASS |
| Second `success_slot = 1` receipt | Rejected by `uq_exam_submission_receipts_success` |

The direct MariaDB smoke applied V14 followed by V15/V16 against an isolated disposable
schema with compatibility stubs for legacy tables. It verified the new tables, V16
columns, nullable receipt slots, and the one-success constraint. It is not a replacement
for a complete Flyway run on the production MySQL/TiDB version.

## Goal 2 Acceptance and Rollback

- [x] V15 creates server-issued sessions, pinned question snapshots, and the single
  idempotency receipt source of truth.
- [x] V16 adds snapshot and authority metadata without editing V13.
- [x] All six modes can be issued; only the four practice modes permit check/complete.
- [x] Anonymous capability tokens are hash-only at rest and required by the anonymous
  resume/check/complete/submit contract.
- [x] Practice completion creates no official attempt.
- [x] Timed original/custom mock server scoring accepts blank MCQ and partial true/false
  submissions, writes snapshot v2, and enforces one successful submit per session.
- [x] Authenticated results are stored in `exam_v2_attempts`; anonymous results remain
  temporary on the session.
- [x] Full backend suite, package, Goal 1 frontend regression gates, and direct V15/V16
  MariaDB smoke passed.

Rollback is additive: do not edit V15 or V16 after a deployment. Keep the frontend on its
existing static flow to avoid using the new APIs. Disable or deny the new routes at the
deployment edge if necessary, retain historical session/attempt snapshots, and use a
new forward migration for any production correction.

## Remaining Issues and Deferred Work

- Run the complete Flyway history on the exact production MySQL/TiDB version in a disposable environment before production deployment.
- Production TiDB version and foreign-key enforcement behavior remain deployment inputs; importer audits remain mandatory regardless.
- Migrate the frontend from static question loading to API-first server-issued sessions.
- Add frontend anonymous-token persistence, server-resume wiring, recovery queue, and
  late/static recovery endpoint flow.
- Implement server deadline/timer authority in the UI and production browser E2E tests.
- Define history labels and analytics exclusion rules for the deferred
  `CLIENT_UNVERIFIED` late/static recovery attempts.
- Define dataset/session retention and cleanup before deleting superseded datasets.
- Static JSON remains a transitional fallback and still exposes answer keys to clients.
- Frontend build reports a large JavaScript chunk warning (about 5.6 MB).
- `npm audit` reports 13 existing dependency advisories; neither newly pinned canonicalization dependency is in the reported vulnerable chains.
