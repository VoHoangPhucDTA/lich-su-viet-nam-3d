# AI Question Revision Workflow

## Scope and invariants

Goal 13C adds post-publish correction without mutating a published candidate or an existing `exam_questions` row. The official bank has no native version/current/soft-delete fields, so a published revision creates a new official row and records supersession only in AI-owned revision tables. It never changes definition visibility or verification.

The lifecycle remains `DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED`, with `PENDING_REVIEW → REJECTED → DRAFT`. There is no shortcut from revision creation to publish. Editing or source remapping is allowed only in `DRAFT` or `REJECTED`; a published revision is immutable.

## Identity, chain, and numbering

`ai_question_candidates.origin_type` distinguishes `GENERATED` and `REVISION`. A revision stores its parent candidate, root and base official IDs, deterministic revision number, reason, base content hash, and a base snapshot of question, explanation, difficulty, topic, and options. The original generated fields remain unchanged.

`ai_question_revision_heads` owns the current official head, the optional open candidate, and `next_revision_number`. The head row is locked while allocating a revision; numbering is never calculated with `COUNT(*)`. Revision 1 is the original official publication, then 2, 3, and so on. Unique constraints cover `(root_official_question_id, revision_number)` and each official/candidate chain link.

`ai_question_official_revisions` is the append-only official chain. It records root, previous official, new official, candidate, revision number, actor, and time. Because the official schema has no safe active/current flag, the head table is authoritative only for this admin workflow and does not alter catalog visibility.

At most one open revision exists for a root. `DRAFT`, `PENDING_REVIEW`, `APPROVED`, and editable `REJECTED` all remain open. A second create returns `AI_REVISION_ALREADY_OPEN`.

## Creation and permissions

`POST /api/exams/ai/candidates/{publishedCandidateId}/revisions` requires `AI_CANDIDATE_CREATE`, a nonblank reason, a published candidate with an official ID, the current official head, and no open revision. Teacher and admin may create/edit/submit; a teacher may review another creator's revision but cannot publish. Admin retains explicit publish permission. Backend permissions are authoritative.

Creation copies the current official question and exactly four options as both current and base snapshots. It also copies the parent sources and generation contract while retaining the parent's original AI snapshot. The parent candidate, its options, sources, hashes, and audit history are never updated.

## Canonical source search and remapping

The browser calls Spring only. `POST /api/exams/ai/candidates/{id}/source-search` checks edit permission and editable revision state, then Spring calls `POST /ai/provenance/sources/search` with `X-Internal-Service-Token`. The internal endpoint is read-only, uses the existing query-embedding/retrieval pipeline, excludes pending-review chunks, applies exact filters, returns at most 20 results and 600 characters per excerpt, and never returns vectors, paths, prompts, tokens, or the full corpus. Distance is debug ranking data, not confidence. It never calls the generation model.

`PUT /api/exams/ai/candidates/{id}/sources` accepts only candidate version, chunk ID/hash pairs, and a nonblank reason. Spring rejects duplicates and non-revision/non-editable states, live-validates all identities against the active corpus/collection/embedding contract, takes canonical metadata from AI Service, replaces only revision sources, increments the optimistic version, and appends `REVISION_SOURCE_REMAPPED`. Prior validation rows remain append-only and become stale by their older candidate-version binding. Remapping is never automatic.

## Base conflicts and review

Before submit, approve, and publish, the root head must still point at `base_official_question_id` and `exam_questions.content_hash` must match `base_content_hash`. A content mismatch returns `AI_REVISION_BASE_CHANGED`; a moved head returns `AI_REVISION_HEAD_CONFLICT`. There is no automatic merge or rebase. Source provenance is revalidated fail-closed at submit, approve, and publish.

Four-eyes, optimistic locking, permission checks, and audited admin-only self-review override from Goals 12/13A still apply. Revision audit types are `REVISION_CREATED`, `REVISION_EDITED`, `REVISION_SOURCE_REMAPPED`, `REVISION_SUBMITTED`, `REVISION_APPROVED`, `REVISION_REJECTED`, `REVISION_PUBLISHED`, `REVISION_PUBLISH_FAILED`, and `REVISION_BASE_CONFLICT`.

## Publish transaction and idempotency

Publish prevalidates provenance, then in one Spring transaction locks the candidate and revision head, rechecks version/base/head and the immutable target, inserts a new official question and exactly four options, inserts the chain link, moves the head and clears the open candidate, marks the revision `PUBLISHED` with the new official ID, and appends audit. Any runtime failure rolls back the official row, options, chain update, head move, and candidate transition; a separate sanitized failure audit is attempted while the candidate remains `APPROVED`.

The old official row and options are never updated or deleted. No `PUBLIC` or `VERIFIED` value is forced. Repeating publish after success returns the existing published candidate; unique constraints and locked head/candidate prevent duplicate official revisions under races.

## Migration and operations

Flyway `V37__ai_question_revision_workflow.sql` follows V36. It backfills existing candidates as `GENERATED`, maps published candidates as revision 1, adds snapshot fields/options, creates head and chain tables with foreign keys/indexes/uniques, and expands audit/provenance action constraints. H2 migration tests normalize only MySQL syntax; production migration was not run.

Operational triage:

- `AI_REVISION_ALREADY_OPEN`: open the linked candidate; do not create another.
- `AI_REVISION_BASE_CHANGED` or `AI_REVISION_HEAD_CONFLICT`: stop; create a fresh revision from the current published head. Goal 13C has no rebase.
- `AI_CANDIDATE_VERSION_CONFLICT`: reload before retrying.
- `AI_CANDIDATE_PROVENANCE_STALE`: search/remap explicitly, then repeat review.
- Source search unavailable: verify internal token, active Chroma contract, and embedding provider without logging the token or excerpts.
- Publish failure: verify candidate remains approved and compare official/options/chain/head counts before retrying.

## Frontend and tests

Published detail shows either “Tạo bản sửa đổi” or the current open-revision link. Revision detail shows base/current content and options, reason/number/hash, current sources, source search/selection/remap, lifecycle actions, and audit. React renders all text escaped; no raw HTML API is used.

Automated coverage includes V37 on H2, service guards, one-open policy, canonical validation/remap, new-official publish dispatch, internal auth/filter/bounded-response behavior, frontend entry/open/comparison/remap/permission/immutability/XSS behavior, and the existing review/provenance suites. Real multi-user E2E and production-like MySQL migration remain Goal 13D; do not deploy or public-publish during Goal 13C.
