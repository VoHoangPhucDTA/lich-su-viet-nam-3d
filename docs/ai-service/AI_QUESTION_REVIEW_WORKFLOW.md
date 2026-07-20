# AI question review workflow

## Safety invariant

`POST /api/exams/ai/generate` never creates a candidate or an official question. Saving, submitting, approving, rejecting, and publishing are separate commands. Approval is not publication. Only an explicit admin publish command can write to `exam_questions`, and its target must be an existing `HIDDEN` + `REVIEW_REQUIRED` MCQ definition in an `ACTIVE` or `VALIDATED` dataset.

## Roles and lifecycle

The current identity model has only `student` and `admin`; it has no teacher role or granular permissions. Students may generate and answer an in-memory quiz, but cannot persist or access review APIs. Admins may generate, select questions to save, review, and publish. Self-review remains allowed for the single-admin thesis/demo deployment and is recorded in audit; four-eyes review is a documented future hardening item.

```text
DRAFT -> PENDING_REVIEW -> APPROVED -> PUBLISHED
                         -> REJECTED -> DRAFT (on edit) -> PENDING_REVIEW
```

No command accepts an arbitrary status. Published content is immutable. Reject requires a non-blank reason. Submit, approve, and publish revalidate question text, explanation, difficulty, grade/lesson, exactly A-D, exactly one correct answer, at least one source, and complete model/corpus/prompt identity.

## Server-controlled generation receipt

Every authenticated generation stores a 30-minute opaque receipt in `ai_generation_receipts`, bound to the generating user, request ID, generated response, source IDs, and provenance. The frontend receives only its UUID and expiry. Candidate creation accepts the receipt UUID plus question indexes; it does not accept client-supplied model names, source mappings, prompts, or corpus identity. A receipt cannot be used by another user, after expiry, or twice for the same question.

No API key, JWT, Authorization header, embedding vector, raw prompt, or full SGK chunk is stored.

## Staging and provenance schema

- `ai_question_candidates`: editable and immutable-original content, lifecycle, generation identity, actors/timestamps, review reason/note, official link, optimistic `version`.
- `ai_question_candidate_options`: A-D, current and original option text, correct flag, stable order.
- `ai_question_candidate_sources`: immutable chunk/document/lesson/page identity and optional chunk hash; no vector or full chunk.
- `ai_question_candidate_audit_events`: append-only application log containing event, actor, transition, changed field names, note, time, and request ID.

Events are `CREATED`, `EDITED`, `SUBMITTED`, `APPROVED`, `REJECTED`, `PUBLISHED`, and `PUBLISH_FAILED`. Provenance establishes generation lineage, not factual correctness.

## Endpoints

All candidate routes require `ROLE_admin` in Spring Security and again in the service layer.

```http
POST /api/exams/ai/candidates
GET  /api/exams/ai/candidates
GET  /api/exams/ai/candidates/publish-targets
GET  /api/exams/ai/candidates/{id}
PUT  /api/exams/ai/candidates/{id}
POST /api/exams/ai/candidates/{id}/submit
POST /api/exams/ai/candidates/{id}/approve
POST /api/exams/ai/candidates/{id}/reject
POST /api/exams/ai/candidates/{id}/publish
GET  /api/exams/ai/candidates/{id}/audit
```

List filters: status, difficulty, grade, lesson number, creator, reviewer, created-from/to, and search; ordering is `created_at DESC, id DESC`, with bounded pagination.

## Atomic publish and idempotency

The publish transaction locks the candidate and target rows, checks the expected version and `APPROVED` status, validates the target, inserts one official MCQ and four options, copies ordinary source citations, updates section/definition counts, links `official_question_id`, changes the candidate to `PUBLISHED`, and appends audit. Any failure rolls back the official data and leaves the candidate approved; a best-effort `PUBLISH_FAILED` audit is written in a separate transaction. The unique receipt item, unique official link, deterministic official question ID, candidate lock, and published short-circuit prevent duplicate publication.

The official question inherits the target definition's hidden/review-required workflow. AI-only metadata stays in staging and is not copied into the official bank.

## UI and operations

- `/exams/ai`: admins can explicitly select generated items and save drafts; students never see this control.
- `/admin/exams/ai-candidates`: paginated/filterable queue.
- `/admin/exams/ai-candidates/:id`: original/current content, edit controls, sources, neutral warnings, provenance, audit, and separate transition commands.
- Publish requires a confirmation dialog and an explicit hidden target.

Operational checks: verify Flyway V35 on a non-production database, log in as admin, generate and save a test question, exercise every transition, publish only to a hidden test definition, repeat publish to confirm the same official link, inspect audit, and confirm a student receives 403. Do not use a public/production dataset for smoke testing.

## Goal 13A–13B amendment

Teacher has create/view/edit/submit/review/audit; admin additionally publishes; student has no candidate authority. Creator and approver differ unless an admin creator explicitly supplies an override reason, producing `SELF_REVIEW_OVERRIDE_USED` separately from `APPROVED`. Approve never publishes.

Submit, approve and publish each perform live canonical validation and fail closed. Missing/changed/pending sources, identity mismatch, timeout or outage leave status unchanged and publish creates no official row. Validation is recorded. Receipt validity stays 30 minutes; each response index is saved once; scheduled retention cleanup preserves referenced receipts. Goal 13C must add new revisions/source remapping rather than mutate published provenance.

## Test strategy and limitations

Unit/security tests cover receipt-aware generation, invalid lifecycle, student denial/admin access, idempotent repeat publish, version conflict, UI provenance/warning/audit rendering, separate submit, explicit publish confirmation, and published immutability. Python generation tests retain grounded metadata. Full real E2E requires MySQL, AI Service, Spring, frontend, and test identities; when unavailable it must be reported as not run rather than inferred from mocks.

Post-publish correction is now delegated to Goal 13C's separate candidate/official revision flow; this original review workflow still never reopens or mutates a published candidate. See `AI_QUESTION_REVISION_WORKFLOW.md` for source remapping, chain/head, conflict and new-official publish rules.
