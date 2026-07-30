# AI Service E2E and Deployment Readiness

## Goal 17A current local release evidence — 2026-07-30

- Docker Desktop 4.61.0, Engine 29.2.1/API 1.53, Compose 5.0.2.
- Compose config pass; MySQL, AI Service, backend và frontend healthy.
- Deterministic Compose E2E 2/2 pass; no Gemini credential; cleanup pass.
- Backend 260 tests, 4 design-valid skip; 13/13 Testcontainers tests run/pass
  với 0 Testcontainers skip.
- Flyway applied and validated 38 migrations.
- AI Service 308 pass/3 live-smoke skip; frontend 536/536 pass.

Các số liệu Goal 13D phía dưới là historical evidence. Khi khác nhau, snapshot
Goal 17A này và `GOAL15_BASELINE.md` là trạng thái hiện hành.

## Goal 13F research-evaluation readiness

- [x] Versioned 36-item manifest validates grade/difficulty balance.
- [x] Offline preflight avoids retrieval initialization and Gemini calls.
- [x] Static blinded package, UTF-8 BOM form, strict import, analysis tables, agreement, and warning comparison pass with explicitly synthetic fixtures.
- [x] Runtime output is Git-ignored and has no PII fields.
- [x] Protocol and thesis templates distinguish engineering evidence from human judgment.
- [ ] Real generation: requires explicit cost/quota approval and preserves failures.
- [ ] Teacher privacy/participation process: manual institutional responsibility.
- [ ] Teacher data collection: NOT STARTED.
- [ ] Teacher analysis: NOT AVAILABLE; **Teacher evaluation: NOT YET COLLECTED**.

This is not deployment approval, teacher approval, or evidence of absolute factual correctness; evaluation decisions do not alter four-eyes candidate/publish workflow.

## Scope and safety

Goal 13E CI matrix, Windows API 1.44 workaround, external History RAG policy, rollback fixture, and repeated HTTP race runner are specified in `AI_SERVICE_CI_AND_TEST_STRATEGY.md`.

Goal 13D was verified on branch `ai_service` from commit `dfd757ac84af1cc770bda2d865a7a2a60b2b317e`. All users, questions, datasets, and credentials used here are local test fixtures. No production database, public dataset, production account, deployment, corpus rebuild, embedding rebuild, Chroma rebuild, prompt change, or model change was performed.

## Environment matrix

| Component | Verified environment | Endpoint/exposure |
| --- | --- | --- |
| MySQL | `mysql:8.4.6`, isolated schema `lichsuvn_ai_e2e` | container network only in Compose |
| Flyway | Spring Boot managed Flyway, 38 migrations | V35–V38 successful |
| FastAPI | Python 3.10 image and local Python runtime | internal `:8001`; local smoke `127.0.0.1:18001` |
| Spring | Java 21 container and local Java runtime | internal `:8080`; local smoke `127.0.0.1:18080` |
| Frontend | Node 22 build, Nginx 1.29 runtime | `127.0.0.1:15173` |

`AI_SERVICE_INTERNAL_TOKEN` was matched between Spring and FastAPI without printing its value. Gemini keys existed only in the FastAPI process/container. The frontend knew only the Spring proxy. Test secrets were supplied at runtime and were not committed.

## MySQL migration verification

Goal 13D initially required a Docker CLI fallback. Goal 17A subsequently ran
Testcontainers 1.21.3 successfully on the same Docker Desktop/Engine family
using `-Dapi.version=1.44`; no database fallback was used for the final gate.

- 38 successful Flyway rows in the current gate; V35–V38 succeeded.
- V35: 552 ms; V36: 734 ms; V37: 3,348 ms in the first isolated run.
- Total first migration execution recorded by Flyway: 12,071 ms.
- Both current Compose runs applied/validated all 38 migrations.
- Spring reported schema version 38 current.
- Flyway emitted a compatibility warning because bundled verification covers MySQL through 8.1, while actual MySQL was 8.4; no migration failed.

Metadata assertions verified the eight Goal 13 tables, five unique indexes, six foreign keys, and the optimistic/revision version columns. The reusable `AiMySqlMigrationIntegrationTest` performs the same assertions when Testcontainers can connect.

## Test identities and authorization

The isolated schema contained `student-test`, `teacher-a`, `teacher-b`, and `admin-test` identities. Registration used the public auth endpoint; activation and role assignment were test-schema setup only.

| Identity | Result |
| --- | --- |
| Student | authenticated; candidate endpoint 403 |
| Teacher A/B | view/create/edit/submit/review/audit; no publish |
| Admin | all candidate permissions including publish |
| Anonymous | candidate endpoint 401 |

Login returned an HttpOnly cookie and `/api/auth/me` returned the expected roles and permissions. A browser-facing request never forwarded its JWT/cookie to FastAPI; Spring used only the internal service token.

## Authenticated multi-service E2E

### Generation and receipt

- Teacher request for grade 12, lesson 6, medium difficulty, `count=1`, `topK=5`: HTTP 200, one question, four options, five grounded response sources, receipt issued, no official question inserted.
- A limited `count=3` request: HTTP 200, three questions, four options each, not partial.
- Receipt was bound to the creator. Another user was rejected, duplicate question index was rejected, and candidate reference prevented unsafe cleanup.
- Expiry and retention cleanup use controlled timestamps in repository tests; no 24-hour wait is required.

### Original four-eyes publish

Teacher A saved one draft from the real receipt. SQL showed four candidate options, one correct option, grounded source identity, `CREATED` audit, and no official insert. Submit performed live provenance validation. Self-approval was denied; Teacher B approved; teacher publish was denied; admin publish succeeded into an isolated ACTIVE/HIDDEN/REVIEW_REQUIRED MCQ target.

SQL after publish showed exactly one official row, four options, one correct option, candidate `PUBLISHED`, linked official ID, and one `PUBLISHED` audit. Definition visibility and verification stayed `HIDDEN` and `REVIEW_REQUIRED`. Repeating publish returned the same reference and did not add rows.

### Self-review override

An admin-created candidate was denied self-review override while another active reviewer existed. In an isolated fixture with no other active reviewer, explicit override plus a nonblank reason succeeded. SQL/API audit contained `SELF_REVIEW_OVERRIDE_USED`; test reviewer states were restored afterward.

### Revision

Two genuinely concurrent create-revision requests produced one success and one `AI_REVISION_ALREADY_OPEN`. The successful revision was number 2, with correct parent/root/base IDs, a 64-character base hash, an open head claim, and `REVISION_CREATED`; the parent candidate and old official row did not change.

Source search returned five canonical results, excluded pending-review content, bounded excerpts to 600 characters, and returned no vector or filesystem path. Remap changed only the revision source and stored a validation/audit trace. A stale editor received `AI_CANDIDATE_VERSION_CONFLICT`.

The revision creator could not self-approve; the other teacher approved; teacher publish was denied; admin publish succeeded. SQL verified:

- old text, explanation, content hash, and four options still match the base snapshot;
- old and new official content hashes differ after the intentional edit;
- new official row has four options and one correct option;
- exactly one revision-chain row points old to new at revision 2;
- head moved to the new official row and `open_candidate_id` cleared;
- target remained HIDDEN/REVIEW_REQUIRED.

Two concurrent publish requests produced one new official revision only. The service now treats the loser as an idempotent existing-reference result if the winner becomes `PUBLISHED` during revalidation; otherwise the normal optimistic conflict remains fail-closed.

## Rollback and provenance failure matrix

`AiRevisionRepositoryTest` injects an exception after official insert and before the publish transaction completes. The transaction leaves one pre-existing official row, four pre-existing options, no partial chain, the candidate `APPROVED`, and the head unchanged. No production failure switch was introduced.

The combined FastAPI and Spring tests cover missing chunk, changed hash, pending-review source, corpus mismatch, collection mismatch, embedding model/dimension mismatch, duplicate ID, timeout, service unavailable, and invalid response. Submit/approve/publish remain fail-closed, no official insert occurs, and stored original hashes are not overwritten.

## Observability and local latency

Existing generation and receipt cleanup meters were retained. Goal 13D adds low-cardinality candidate meters:

- `ai.candidate.lifecycle` with fixed action/outcome values;
- `ai.candidate.provenance.validation` with fixed action/outcome values;
- `ai.candidate.publish.conflicts`;
- `ai.candidate.revision` with fixed action/outcome values.

No question text, context, JWT, key, token, prompt, vector, or database credential is used as a metric label.

These are local smoke observations, not production benchmarks. State-changing operations intentionally have `n=1`; for `n=1`, average/P50/P95/min/max are the same value.

| Operation | n | Avg/P50/P95/min/max |
| --- | ---: | ---: |
| Generation count 1 | 1 | 12,323 ms |
| Generation count 3 | 1 | 21,166 ms |
| Candidate save | 1 | 167 ms |
| Submit validation | 1 | 354 ms |
| Approve validation | 1 | 328 ms |
| Original publish | 1 | 380 ms |
| Source search | 1 | 869 ms |
| Source remap | 1 | 288 ms |
| Revision publish (concurrent wall time) | 1 | 571 ms |

Application logs were inspected for key/token/JWT/Authorization header, full fact context, full SGK chunks, vectors, raw prompt, and database password. None was found. Request IDs are generated at the Spring boundary and sent to the internal AI call/audit. Nginx supplies `X-Request-Id` to Spring.

## Development/test container startup

The packaging is intentionally development/test only:

- `ai-service/Dockerfile`: pinned dependencies, non-root, lightweight health, runtime corpus/Chroma mounts, no embedding rebuild.
- `backend/Dockerfile`: Maven wrapper build, Java 21 runtime, non-root, liveness health, environment configuration.
- `frontend/Dockerfile`: production Vite build and Nginx; only `/api` proxies to Spring.
- `compose.ai-e2e.yml`: MySQL, FastAPI, Spring, frontend, health dependencies, isolated named database volume, internal service network, explicit AI outbound network, and loopback-only frontend edge.

Create an untracked environment file from `.env.ai-e2e.example`, fill test-only values, then run:

```powershell
docker compose --env-file .env.ai-e2e.local -f compose.ai-e2e.yml config -q
docker compose --env-file .env.ai-e2e.local -f compose.ai-e2e.yml build
docker compose --env-file .env.ai-e2e.local -f compose.ai-e2e.yml up -d --wait
docker compose --env-file .env.ai-e2e.local -f compose.ai-e2e.yml ps
Invoke-WebRequest http://127.0.0.1:15173/ -UseBasicParsing
docker compose --env-file .env.ai-e2e.local -f compose.ai-e2e.yml down
```

Flyway is enabled by default only for this disposable E2E schema. Set `AI_E2E_FLYWAY_ENABLED=false` when migration is managed separately. Production profiles already disable uncontrolled Flyway; this Compose file is not a production manifest.

The Goal 17A clean Compose verification built all three application images, created a fresh MySQL volume, migrated 38 versions, and reached healthy status for all four services in both repetitions. Frontend `/` returned 200; unauthenticated `/api/auth/me` through Nginx/Spring returned 401. MySQL and FastAPI were not published to the host.

## History RAG baseline

The default History RAG integration tests now create a deterministic package through `HistoryRagTestPackageFixture`; they do not require an external checkout artifact. The canonical release/package producer remains `scripts/history-rag/export_workbook.py`, and validation of a real exported package is still a separate manual release check documented in `backend/TESTING.md`.

## Readiness checklist and known limitations

- [x] Real MySQL 8.4 migrations and constraints verified.
- [x] Real auth, generation, receipt, four-eyes, original publish, revision, concurrency, and optimistic locking verified.
- [x] Rollback and provenance fail-closed matrix verified.
- [x] Metrics/logging/security baseline recorded.
- [x] Four-container clean startup verified.
- [ ] Production deployment approval: out of scope and not performed.
- [x] Testcontainers on Docker Desktop/Engine 29: 13/13 tests ran and passed with API version 1.44 configured for compatibility.
- [x] Default History RAG integration suite: deterministic fixture, 3/3 tests run and pass.
- [ ] Canonical exported History RAG release package: manual artifact validation remains separate from the deterministic CI fixture.
- [ ] Local latency sample sizes are smoke-level only and must not be presented as production SLO data.
