# AI Service security and provenance

> Goal 13D verified fail-closed provenance failures, runtime-only secrets, sanitized logs/metrics, no internal API strings in the frontend bundle, and no host-published MySQL/FastAPI ports. Goal 13E adds a test/e2e-only deterministic provider rejected by production settings.

## Permission matrix

| Capability | Student | Teacher | Admin |
|---|---:|---:|---:|
| Create/view/edit/submit candidate | No | Yes | Yes |
| Review/audit | No | Yes | Yes |
| Publish/manage target | No | No | Yes |

The authorities are `AI_CANDIDATE_CREATE`, `AI_CANDIDATE_VIEW`, `AI_CANDIDATE_EDIT`, `AI_CANDIDATE_SUBMIT`, `AI_CANDIDATE_REVIEW`, `AI_CANDIDATE_PUBLISH`, and `AI_CANDIDATE_AUDIT_VIEW`. Spring enforces them in method security and service code. Auth responses expose roles/permissions for presentation only; backend state is authoritative and revocation is observed when the authenticated principal is reloaded.

## Four-eyes and publication

Normal approval requires `createdBy != reviewer`. Teacher can never self-approve. Only when no other active teacher/admin reviewer exists may an admin creator explicitly request `selfReviewOverride=true` with a nonblank reason for a single-admin demo. This sets trace fields and writes `SELF_REVIEW_OVERRIDE_USED` separately from `APPROVED`. Review never implies publish, and approve never publishes.

## Live provenance contract

Spring sends server-stored corpus SHA, collection, embedding contract and chunk ID/hash pairs to protected `POST /ai/provenance/validate`. Authentication uses `X-Internal-Service-Token` from `AI_SERVICE_INTERNAL_TOKEN`, not a user JWT or Gemini key. The handler is read-only: no Gemini call, embedding, generation query, mutation, document/vector/path response, or client-created source.

FastAPI compares the active manifest/collection contract and reads Chroma metadata for existence, hash and pending-review state. Submit, approve and publish always validate and fail closed. Source missing/changed/not eligible, stale corpus/collection/embedding, invalid response, timeout and unavailability leave candidate status unchanged. Publish validation failure occurs before official insertion. V36 records candidate/version/action/time/identity/count/result/sanitized codes and matching audit events; it stores no source text, vectors or secrets. Revalidation establishes lineage consistency, not factual certainty.

## Receipt retention

Generation receipts remain owner-bound and valid for 30 minutes. A receipt represents the whole response; the unique receipt/index constraint allows each question index to create at most one candidate. Default retention is 24 hours. The scheduled job selects stable batches (default 100), deletes only expired rows beyond retention with no candidate reference, and is idempotent. Referenced receipt payload remains available for audit. Metrics expose runs, deleted count and failures; logs expose counts only.

## Deployment, testing and troubleshooting

Apply V36 in a non-production database first. Explicitly assign teacher through existing `user_roles`; migration only seeds the role. Configure the same strong internal token on both services, redact it from diagnostics, and coordinate rotation/restart. A 401/503 from the validator generally means missing/mismatched service token; timeout/unavailable means inspect FastAPI/network; stale/source codes require regenerate/new candidate rather than hash overwrite or bypass.

Tests cover controller/service authorization, four-eyes and override audit, fail-closed provenance and audit, migration/H2, receipt cleanup boundaries, protected metadata-only FastAPI validation, and permission-aware UI. Real E2E requires MySQL, two reviewer identities, FastAPI, Spring and frontend and must use a hidden review-required target.

## Goal 13C canonical search/remap security

Canonical search shares the constant-time internal-token guard and fixed server-to-server route. It is read-only, eligible-only, bounded (`topK <= 20`, excerpt <= 600), and returns no vectors, filesystem paths, prompts, credentials, or full corpus. Spring never forwards a user JWT and the browser never receives the service token. Remap takes chunk ID/hash only, rejects duplicates, then persists canonical metadata only after corpus/collection/embedding/source validation. Audit stores identities/reasons/request IDs—not source text or secrets—and parent provenance remains unchanged.
