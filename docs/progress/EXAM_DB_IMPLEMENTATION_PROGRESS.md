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

Migration `V31__versioned_exam_question_bank.sql` creates:

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

`utf8mb4_unicode_ci` is used by V31 so the new schema remains portable across MySQL, TiDB-compatible deployments, and the local MariaDB smoke-test engine.

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
9c3a6408b8372f520aa028b0c72887491970f2c54d71e0cc03f781184c0310ed
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
- `backend/src/main/resources/db/migration/V31__versioned_exam_question_bank.sql`
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
| `npm run test:run` | PASS, 16 files / 55 tests |
| `npm run build:data` | PASS |
| Two-build deterministic hash comparison | PASS |
| `npm run build` | PASS |
| `./mvnw test` | PASS, 31/31 tests |
| `./mvnw -DskipTests package` | PASS |
| V31 SQL on isolated MariaDB | PASS, 11 tables and expected constraints |
| Flyway V31-V34 on configured TiDB | PASS; schema current at V34 |
| Import/promote on configured TiDB | PASS, dataset `ACTIVE` with audited counts |
| HTTP catalog smoke test on imported DB | PASS: 23 verified public exams, 32 topics, preview HTTP 200, no answer-key fields |
| Existing attempts endpoint remains protected | PASS, anonymous HTTP 401 |

The configured TiDB already had an applied Flyway history through V30. The branch's conflicting local V12/V14-V16 names were reconciled by restoring the exact applied V12-V30 migrations and renumbering the new additive work to V31-V34. Flyway then applied V31-V34 successfully. The question-bank import was promoted on that TiDB instance and audited at 38 exams, 76 sections, 1,064 questions, 32 topics, and 1,092 mappings.

## Acceptance Criteria

- [x] Versioned question bank schema implemented without changing V13.
- [x] Deterministic RFC 8785 build and metadata artifact implemented.
- [x] Duplicate raw JSON properties rejected before normal parsing.
- [x] Node/Java canonicalization parity covered by shared fixtures.
- [x] Import dry-run, staging, validation, atomic promote, failed-promote retention, and repeat-hash `SKIPPED` covered by tests.
- [x] Real SQL-engine V31 and importer smoke tests passed, including the configured TiDB runtime.
- [x] Catalog, detail, topics, and custom preview APIs implemented against the active dataset.
- [x] Hidden/reviewable policies and answer-key leakage tests passed.
- [x] Frontend data build and backend test/package gates passed.
- [x] No files staged, committed, or pushed by this goal.

## Rollback

1. Do not activate the `import-exams` profile to disable importer execution; its default mode is dry-run.
2. Keep all existing static exam JSON and frontend loaders available as the transitional fallback; API-first is now the primary frontend path.
3. To roll back imported content, transactionally lock `exam_runtime_state`, point `active_dataset_id` to the prior retained dataset, mark that dataset `ACTIVE`, and mark the reverted dataset `SUPERSEDED`.
4. Do not drop old datasets while active sessions/recovery support remains deferred and retention policy is not implemented.
5. Do not edit or roll back applied Flyway migrations manually. Any production schema correction must use a new migration.

## Phase 3 - Server-Issued Sessions and Practice

### Database

Migration `V32__exam_sessions_and_submission_receipts.sql` adds:

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

Migration `V33__exam_v2_attempt_snapshot_authority.sql` appends, without editing V13:

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

Timed original and custom mock submission uses the final backend wire contract as an
`answers` array, with exactly one entry for every issued question-instance ID. Earlier
Goal 2 planning text described this collection as a map; the implemented DTO, service,
tests, and Phase 5 client all use the array contract. MCQ `selected: null` is a valid
blank answer. True/false values
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
an on-time timed attempt. The recovery endpoint can later verify and score the pinned
server session or retained H1 static descriptor, but records it with
`CLIENT_UNVERIFIED` timing and a non-`SERVER_ON_TIME` origin.

## Goal 2 Validation Results

| Check | Result |
|---|---|
| `ExamSessionServiceIntegrationTest` | PASS, 7/7 |
| Goal 1 dataset/catalog regression selection | PASS, 10/10 |
| `./mvnw test` | PASS, 28/28 |
| Direct V32/V33 SQL smoke on isolated MariaDB 10.4 | PASS |
| Two non-success receipt slots per session | PASS |
| Second `success_slot = 1` receipt | Rejected by `uq_exam_submission_receipts_success` |

The direct MariaDB smoke applied V31 followed by V32/V33 against an isolated disposable
schema with compatibility stubs for legacy tables. It verified the new tables, V33
columns, nullable receipt slots, and the one-success constraint. It is not a replacement
for a complete Flyway run on the production MySQL/TiDB version.

## Goal 2 Acceptance and Rollback

- [x] V32 creates server-issued sessions, pinned question snapshots, and the single
  idempotency receipt source of truth.
- [x] V33 adds snapshot and authority metadata without editing V13.
- [x] All six modes can be issued; only the four practice modes permit check/complete.
- [x] Anonymous capability tokens are hash-only at rest and required by the anonymous
  resume/check/complete/submit contract.
- [x] Practice completion creates no official attempt.
- [x] Timed original/custom mock server scoring accepts blank MCQ and partial true/false
  submissions, writes snapshot v2, and enforces one successful submit per session.
- [x] Authenticated results are stored in `exam_v2_attempts`; anonymous results remain
  temporary on the session.
- [x] Full backend suite, package, Goal 1 frontend regression gates, and direct V32/V33
  MariaDB smoke passed.

Rollback is additive: do not edit V32 or V33 after a deployment. Keep the frontend on its
existing static flow to avoid using the new APIs. Disable or deny the new routes at the
deployment edge if necessary, retain historical session/attempt snapshots, and use a
new forward migration for any production correction.

## Goal 2 Deferred Work at Closeout (Historical)

The list below records the state when Goal 2 ended. Goal 3 sections later in this
document supersede items completed by the API-first, recovery, TiDB runtime, and
browser-validation work; only items repeated under **Goal 3 Remaining Work (Deferred to Goal 4)** remain
open now.

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

## Goal 3 - Frontend API-First Sessions and Recovery

### Phase 5 Frontend Integration

- Browse, topic/period catalog, custom preview, timed original, custom mock, free
  practice, topic practice, retry-wrong, and custom practice now create or resume
  server-issued sessions first. The frontend renders `SafeQuestion` API snapshots
  before check/submit and uses the existing static pages only for transport-level
  API unavailability.
- Anonymous session capability tokens are stored only under
  `exam_session_token_{sessionId}` and are sent through
  `X-Exam-Session-Token`; they are not included in result caches or snapshots.
- Timed submission sends raw answers only. Result rendering prefers immutable
  backend snapshot v2 and retains a legacy-result adapter for existing local data.
- The published original-exam route retains a visible local static fallback when
  the API is unavailable. Authentication, validation, version and authorization
  errors are not treated as fallback conditions.

### Phase 6 Recovery

- `POST /api/exam-submissions/recover` requires an authenticated owner and queues
  only authenticated local timed/mock submissions. Anonymous local results remain
  local and are never attached to a later account.
- A server-issued late recovery re-scores its pinned session with
  `BACKEND` / `CLIENT_UNVERIFIED` / `SERVER_ISSUED_LATE`. Static recovery validates
  the retained H1 dataset, content hash, and exact original-exam question order
  before it can create `BACKEND` / `CLIENT_UNVERIFIED` / `CLIENT_FALLBACK`.
  Version mismatch preserves the raw local queue item and does not create an
  official attempt.
- Recovery requests have a unique client receipt and the existing one-successful-
  submission-per-session constraint still decides concurrent submissions. History
  can display authority labels; analytics that require verified timing must exclude
  `CLIENT_UNVERIFIED` and non-`SERVER_ON_TIME` attempts.
- Queue records now persist a schema version, owner, raw answer descriptor, client
  timing, immutable local result, retry metadata, and one of `PENDING`, `SYNCING`,
  `BACKEND_SCORED`, `VERSION_MISMATCH`, `AUTH_MISMATCH`, `FAILED_RETRYABLE`, or
  `FAILED_PERMANENT`. A module-level lock prevents concurrent queue flushes, while
  retryable transport failures use bounded exponential backoff from 5 seconds up to
  5 minutes so page renders cannot trigger an immediate retry loop.
  Static original fallback computes the same RFC 8785 content hash used by the
  importer and queues only authenticated timed work; it never promotes anonymous
  work after a later login.

### Goal 3 Validation Results

| Check | Result |
|---|---|
| `ExamSessionServiceIntegrationTest` | PASS, 10/10 including late, static H1 recovery, owner rejection, and replay |
| `./mvnw test` | PASS, 31/31 after additional static recovery coverage |
| `./mvnw -DskipTests package` | PASS |
| `npm run test:exam-data` | PASS, 3/3 |
| `npm run test:run` | PASS, 17 files / 66 tests |
| Targeted API/session/adapter contract tests | PASS: metadata/preview routes, anonymous token header, submit array with blank/partial answers, transport-only fallback, server/local resume merge, legacy retry UX, legacy adapter, and authority-statistics exclusion |
| Targeted recovery queue tests | PASS, 6/6: anonymous isolation, backend-scored replay, version mismatch, bounded transport retry, concurrent-flush suppression, and owner mismatch preservation |
| `npm run build:data && npm run build` | PASS; static copy 474 items |
| Targeted ESLint for new API/session/recovery files | PASS |
| Configured TiDB Flyway runtime | PASS; V31-V34 applied, `/actuator/health` reports `UP` |
| Configured TiDB question-bank import | PASS; 38 exams / 1,064 questions promoted |
| Browser API-first original exam | PASS; 28 questions, draft/deadline resume, backend submit, snapshot result |
| Browser custom mock | PASS; 10-question server-selected session, backend result and explanations |
| Browser practice/retry/topics | PASS; checked answers lock, practice creates no attempt, snapshot retry and 32-topic catalog load |
| Browser history/detail | PASS; authenticated backend history and result detail from a clean frontend origin |
| Browser backend-off fallback/recovery | PASS; static result retained locally, then recovered as `BACKEND` / `CLIENT_UNVERIFIED` / `CLIENT_FALLBACK` |

### Runtime Fixes Found During Browser QA

- Catalog requests now use the backend's `verified` view and ignore aborted StrictMode
  requests, avoiding a false static-fallback state.
- Catalog badges use the backend verification status as their authority, so the 23
  verified exams and 15 review-required exams are labeled consistently.
- Session locators are scoped by authenticated owner or `anonymous`; an anonymous
  draft cannot be resumed accidentally after login. Successful submit/manual practice
  completion clears the current owner's locator.
- Custom practice can resume from its server-issued `initialSessionId` without requiring
  a second create request. Final practice check refreshes the server-completed state.
- Legacy local results now display their authority label on the result page, matching
  history and recovered snapshot result labels.

### Goal 3 Compatibility and Rollback

- Snapshot-v2 retry creates `RETRY_WRONG` sessions from the immutable reviewed-question
  snapshot. Legacy custom results that already contain local question snapshots retain
  their compatibility flow. Legacy original results without immutable snapshots receive
  the explicit `RETRY_SOURCE_UNSUPPORTED` response and are never silently rebuilt from
  the current answer key.
- Static fallback and the legacy attempt endpoint remain enabled. Operational rollback
  can route users back to the existing local pages without deleting API result caches or
  recovery queue items. Backend schema rollback remains forward-only: retain immutable
  attempts/snapshots and ship a new migration for any database correction.

### Goal 3 Remaining Work (Deferred to Goal 4)

- Add dedicated HTTP/MVC tests for static-recovery descriptor mismatch and duplicate
  recovery replay; current service integration coverage already exercises both recovery
  authorities, ownership rejection, version mismatch, and idempotent replay.
- Define and automate retention cleanup for expired anonymous sessions and superseded
  datasets; immutable attempt snapshots must outlive session cleanup.
- The non-web importer profile still initializes web security and therefore should use
  the normal web application type until its profile wiring is isolated.
- The production bundle remains large (about 5.7 MB minified), which is a Vite warning
  rather than a functional build failure.
- Full-repository lint still includes pre-existing non-exam/legacy findings; all
  API/session/recovery files changed in Goal 3 pass targeted ESLint.

## Goal 4 - Phase 7 Stabilization

### Pre-remediation Migration Integrity Gate: BLOCKED

Phase 7 started from branch `be_exams` at
`4a200701bf5d170a6aa007ee64406a76fc8c8c76`. The worktree already contained the
Goal 1-3 migration reconciliation before this audit; Phase 7 did not edit, delete,
rename, repair, or reapply any migration from V1 through V34.

The current migration directory contains exactly one source file for every version
V1-V34 and no duplicate version. V12-V30 source blobs match the same paths on
`origin/main` byte-for-byte. The exam additions are:

- V31 `V31__versioned_exam_question_bank.sql`: versioned dataset/question-bank,
  import-audit, runtime-pointer, catalog, section, question, option/statement,
  source, topic, and mapping tables.
- V32 `V32__exam_sessions_and_submission_receipts.sql`: server-issued sessions,
  immutable per-session question snapshots, anonymous capability ownership, and the
  submission receipt/idempotency tables.
- V33 `V33__exam_v2_attempt_snapshot_authority.sql`: snapshot schema and score,
  timing, origin, scoring-version, dataset-version, and content-hash authority fields
  on `exam_v2_attempts` plus its history index.
- V34 `V34__expand_event_geo_type_enum.sql`: modifies only
  `historical_events.geo_type`, expanding the non-null ENUM to include
  `point`, `multi_point`, `multi_polygon`, and `mixed` alongside the existing values.
  It creates no table or index and is unrelated to exam recovery or TiDB-specific
  behavior. It was needed to preserve the earlier geo-type compatibility change after
  the exam migrations were renumbered. Rollback is forward-only through a new migration
  after proving that no rows use values that would be removed. Runtime Flyway validation
  and application restart prove that V34 is present and accepted by the configured DB.

The configured TiDB `flyway_schema_history` reports successful V1-V34 and successful
checksums for V31-V34. Runtime startup validated 34 migrations, reported schema version
34 as current, ran no migration, and reached health `UP`. However, the V12 history row
is internally inconsistent:

- version: `12`;
- description: `nullable event chronology`;
- script: `V12__expand_event_geo_type_enum.sql`;
- checksum: `471765287`, which validates against the current chronology source rather
  than the enum source named by the `script` column.

The enum source named by that V12 history row is byte-identical to current V34 and V34
has checksum `65777660`. Git history also shows that `origin/main` carried both V12
filenames. Therefore the audit cannot prove that current V12 is the exact source file
originally applied; the evidence is consistent with historical Flyway repair or manual
history reconciliation. The history also has no installed-rank 21, which requires
provenance before claiming an untouched migration ledger.

Additional Git provenance confirms that the conflict was known. The historical
`RemoteFlywayBridgeContractTest` on `origin/main` explicitly identifies remote V12 as
`expand event geo type enum`, repository V12 as `nullable event chronology`, and states
that default validation would fail. Its one-time bridge profile disables
`validate-on-migrate`, while the contract explicitly rejects INSERT, UPDATE, or DELETE
against `flyway_schema_history`. That bridge explains how chronology could be applied
forward through V14, but it does not explain the current V12 checksum/description rewrite.
No auditable repository artifact recorded who reconciled that row or by which
controlled procedure.

Per the Phase 7 gate, Flyway `validate` passing is not enough when source filename and
history metadata disagree. No Flyway repair, history-row update/delete, migration rename,
or V35 workaround was attempted. At that gate, HTTP recovery hardening, retention cleanup,
importer changes, legacy retirement, static-fallback retirement, bundle work, and browser
Phase 7 regression were paused until the migration provenance decision was made.

### Blocked-Gate Baseline

| Check | Result |
|---|---|
| `./mvnw clean test` | PASS, 31/31 |
| `./mvnw -DskipTests package` | PASS |
| `npm run test:exam-data` | PASS, 3/3 |
| `npm run test:run` | PASS, 17 files / 66 tests |
| `npx tsc -b` | PASS |
| `npm run build:data` | PASS, 38 sources / 1,064 questions |
| `npm run build` | PASS; bundle 5,687.82 kB minified, 474 static items copied |
| Configured TiDB runtime restart | PASS; validate 34, schema current V34, health `UP` |

### Configured TiDB V12 Metadata Remediation - Applied, Gate PASS

On `2026-07-19`, the configured TiDB V12 row matched the approved guard exactly and the
metadata-only remediation was applied in one transaction. Exactly one row changed:
`script` moved from `V12__expand_event_geo_type_enum.sql` to
`V12__nullable_event_chronology.sql`. Version, description, checksum, installed rank,
installed timestamp, execution time, and success were unchanged. A second guarded update
affected zero rows and was rolled back.

The full Flyway ledger was backed up before the transaction. No credential, datasource
username, or JDBC URL was written to the repository or validation logs.

| Gate check | Result |
|---|---|
| Flyway validate/info | PASS; V34 current; 34 applied; 0 pending; 0 failed |
| Backend restart 1 | PASS; health UP; graceful shutdown |
| Backend restart 2 | PASS; health UP; graceful shutdown |
| `./mvnw clean test` | PASS, 31/31 |
| `./mvnw -DskipTests package` | PASS |
| Exam active dataset audit | PASS, 38 exams / 76 sections / 1,064 questions / 32 topics / 1,092 mappings |
| Integrity audit | PASS, one active pointer; no orphan section/question; no dataset-section mismatch |
| Schema/business count fingerprints | Unchanged before/after |
| Flyway rows | 34 before/after |
| Maximum installed rank | 35 before/after, because historical rank 21 is absent |

The remediation itself is successful and no migration reran. On `2026-07-19`, the owner
explicitly accepted `34 rows / max installed_rank 35` as the valid immutable baseline.
The historical missing rank 21 is therefore documented rather than rewritten. The
approved V12 transaction did not alter installed ranks, and no repair, rank rewrite,
migration rename, V35, or business-data cleanup was attempted. Together with the passing
validate/info, restart, schema comparison, test, and package checks, the migration
integrity gate is PASS and Phase 7 stabilization may continue.

### Phase 7 Recovery and Runtime Hardening

- Static recovery now validates the authenticated owner, retained dataset version,
  aggregate hash, exam content hash, exam descriptor, exact ordered public-question
  descriptor, answer shape, and receipt idempotency before backend scoring. Client score,
  correctness, timing authority, and origin fields are ignored.
- Server-issued late `TIMED_ORIGINAL` and `CUSTOM_MOCK` sessions remain recoverable from
  their pinned question snapshots. Static `CUSTOM_MOCK` recovery is intentionally rejected
  with `RECOVERY_DESCRIPTOR_UNAVAILABLE`: the legacy browser-generated custom set does not
  carry a server-verifiable normalized selection/scoring descriptor, so it remains a local
  result rather than being promoted as an official attempt.
- HTTP/MVC integration coverage exercises unauthenticated, malformed, wrong-owner,
  dataset/content/descriptor/order mismatch, duplicate/missing/extra refs, forged score,
  idempotent replay, conflicting replay, retained-H1 recovery, late server-issued recovery,
  static-original recovery, server-issued custom recovery, and static-custom rejection.
  The one-successful-submission-per-session constraint prevents a second attempt.

### Phase 7 Importer and Retention

- The explicit `import-exams` entry point now runs as `WebApplicationType.NONE` with a
  profile-scoped context. Its default is dry-run (`app.import.exams.promote=false`); only an
  explicit promotion flag can change the active dataset pointer. The normal application
  context still discovers all seven JPA repositories.
- Retention is disabled by default and has no scheduler or public endpoint. Dry-run reports
  candidates; apply requires the explicit enable flag and rechecks age/status plus pending
  receipt protection inside bounded batches.
- Current policies are 7 days for anonymous in-progress sessions, 30 days for anonymous
  submitted/completed-practice and terminal failed/superseded receipts, 30 days for
  authenticated in-progress sessions, and 365 days for authenticated submitted sessions.
  `RECEIVED`, `PROCESSING`, and `FAILED_RETRYABLE` receipts protect their session.
- Immutable attempts are never cleanup targets. Superseded datasets are report-only for at
  least 365 days because the backend cannot see every browser recovery queue. No retention
  apply or dataset deletion was run against the configured TiDB.
- Integration coverage proves that deleting an eligible submitted session leaves its
  immutable `exam_v2_attempts` result snapshot intact.

### Phase 7 Authority, Compatibility, and Bundle

- History keeps late/static recovery attempts visible with their authority label, but
  verified-timing statistics include only `BACKEND` / `SERVER` / `SERVER_ON_TIME` results.
  Browser QA showed five visible attempts while the verified counter remained three after
  a new static recovery was added.
- The legacy frontend-scored `POST /api/exams/attempts` write is retired with HTTP 410 and
  `LEGACY_EXAM_WRITE_RETIRED`. Its write-only frontend client, backend DTO, and service path
  were removed. Authenticated GET list/detail compatibility remains available for existing
  attempts, and HTTP coverage proves the read path still works after write retirement.
- Static JSON fallback remains transitional and exposes answer keys to the browser. It is
  retained because backend-off browse, original exam, practice, and local result are required
  product behavior. Static custom mock remains local-only and is not shown as an official
  backend attempt. Its create screen now states clearly that the result stays in this browser
  and cannot become a system-verified attempt.
- History cards render even when every visible result is a late/static recovery and the
  verified-timing aggregate is empty. The aggregate remains restricted to backend-scored,
  server-timed, on-time attempts.
- Route-level lazy loading was validated in the working tree and reduced the main entry chunk
  from approximately 5,687.82 kB to 258.97 kB minified (82.89 kB gzip). The required
  `App.tsx` hunk remains uncommitted because it is inseparable from a pre-existing dashboard
  removal whose source is unavailable. The committed API-first components compile, but route
  activation and bundle optimization remain deferred until that provenance is resolved.

### Phase 7 Browser QA

| Flow | Result |
|---|---|
| Authenticated original timed exam | PASS: 28 questions, draft/deadline resume after reload, backend submit, immutable snapshot result |
| Server-selected custom mock | PASS: 10 questions, backend submit, snapshot review and explanations |
| Free practice | PASS: per-question check, checked answer locked after reload, manual early completion, no attempt |
| Topic practice | PASS: 32-topic catalog, server-selected 30-question session, check result and answer lock |
| Retry wrong | PASS: 27 wrong questions created from immutable snapshot v2 |
| History authority | PASS: recovery rows remain visible and are excluded from verified-timing aggregate |
| Backend-off original fallback | PASS: 23 verified static exams, local result retained and later backend-scored as `CLIENT_FALLBACK` |
| Backend-off custom mock | PASS: local snapshot/review retained; no official backend attempt created |
| Recovery queue after restart | PASS: two pending original results recovered; custom static result remained local-only |
| Legacy local result compatibility | PASS: custom config, score, analysis, review, and explanation render from the legacy snapshot adapter |
| Anonymous original session resume | PASS: capability token restored the fixed question set, answer draft, and deadline after reload; submit returned an immutable result |
| Double submit | PASS: rapid repeated confirmation produced one successful submission and one attempt |
| Cross-account recovery isolation | PASS: account B did not flush or display account A's queued submission; account A recovered it after signing back in |
| Server-issued late recovery | PASS: backend-off submit stayed queued, then recovered after restart with the unverified-timing authority label |
| Custom local-only disclosure | PASS: backend-off create screen displays the local-only, non-verified result warning |

### Phase 7 Final Validation

| Check | Result |
|---|---|
| `./mvnw clean test` | PASS, 41/41 |
| `./mvnw -DskipTests package` | PASS |
| `npm run test:exam-data` | PASS, 3/3 RFC 8785/duplicate-key/deterministic-hash tests |
| `npm run test:run` | PASS, 18 files / 67 tests |
| `npx tsc -b` | PASS |
| `npm run build:data` | PASS, 38 exams / 1,064 questions / 32 topics / 1,092 mappings |
| `npm run build` | PASS, 3,551 modules and 474 static items |
| Targeted ESLint for Phase 7 frontend files | PASS |
| Browser backend restart/health | PASS, `/actuator/health` returned `UP` |

### Phase 7 Residual Risks and Rollback

- `frontend/src/App.tsx` is intentionally excluded from finalization commits. The committed
  API-first pages/services are not yet wired into the route table, and the lazy-loading change
  is not present in committed history. Resolve the missing `/exams/thong-ke` dashboard source
  or explicitly retire that route before staging the exam route hunks.

- The Vite warning remains for lazy map/event chunks. Further vendor/manual chunking is a
  performance follow-up, not an exam correctness blocker.
- The importer uses deprecation-marked Jackson APIs and Mockito currently self-attaches a
  Java agent; both compile/test successfully but should be updated before future JDKs make
  dynamic agent loading unavailable.
- Rollback keeps V31-V34 and immutable attempts in place. Disable API-first routing at the
  frontend and retain local caches/queue items; it does not re-enable the retired
  frontend-scored POST. Ship only forward migrations for schema corrections. Do not run
  Flyway repair or delete retained datasets while sessions or recovery items may still
  reference them.
- Browser QA created additive disposable users and attempts on the configured development
  TiDB. They were not deleted because this Goal forbids destructive shared-database cleanup.
