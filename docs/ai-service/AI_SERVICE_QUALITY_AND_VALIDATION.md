# AI Service quality and validation — CI, tests, E2E, deployment readiness

> Hợp nhất từ `AI_SERVICE_CI_AND_TEST_STRATEGY.md` và
> `AI_SERVICE_E2E_AND_DEPLOYMENT_READINESS.md` (canonicalization 2026-08-10).
> Số liệu baseline/performance chi tiết: `GOAL15_BASELINE.md` và `SELF_PRACTICE_LATENCY_AUDIT.md`.

## Test layers

| Tầng | Nội dung |
|---|---|
| AI unit (offline) | full offline AI pytest với app/scripts coverage floors; no Gemini |
| Spring | `Ai*`/HTTP client tests, controller/service authorization, receipt/revision repositories và rollback semantics |
| Frontend | Vitest cho quiz/candidate pages, services, types |
| MySQL integration | Testcontainers MySQL 8.4.6, toàn bộ Flyway migrations (hiện V1–V43), schema assertions |
| E2E | four-container deterministic Compose; auth, count 1/3, receipt, four-eyes, five original + five revision HTTP races, SQL invariants; repeat twice + cleanup |
| Real Gemini | protected manual `workflow_dispatch`, non-fork only, secret required, count-one smoke |

Repository có ESLint baseline failures không liên quan, nên AI dùng scoped lint cho AI quiz/candidate pages; TypeScript và production build vẫn là gate toàn project.

## CI jobs (GitHub Actions)

| Job | Required checks |
|---|---|
| `static` | diff whitespace, pinned Python tooling, Ruff, full `app scripts` Mypy, Python compileall, backend compile, frontend TypeScript/build, scoped AI frontend lint, tracked-file secret scan |
| `unit` | full offline AI pytest với coverage floors, Spring `Ai*`/HTTP client tests, frontend Vitest; no Gemini |
| `mysql-integration` | Testcontainers MySQL 8.4.6, all Flyway migrations (hiện V1–V43), schema assertions, receipt/revision repository và rollback semantics |
| `compose-e2e` | four containers, deterministic provider, auth, count 1/3, receipt, four-eyes, HTTP races, SQL invariants, repeat twice và cleanup |
| real Gemini | protected manual `workflow_dispatch`, non-fork only, secret required, count-one smoke |
| History RAG package | protected manual artifact download, fixed checksum preflight, package reader test |

## Python quality gates (Goal 15H)

```text
python -m ruff check .
python -m mypy app scripts --show-error-codes
python -m compileall -q app scripts
python -m pytest --cov=app --cov=scripts --cov-report=term-missing
python -m coverage report --include='app/*' --fail-under=89
python -m coverage report --include='app/*,scripts/*' --fail-under=82
```

Coverage floors: app ≥ 89%, app+scripts ≥ 82% (dưới giá trị đo 89.56% / 82.94%). Coverage 7.15.2 pinned. Job uploads chỉ sanitized JUnit XML (7 ngày); không upload `.coverage`, storage, Chroma, corpus, provider responses, secrets.

## Deterministic provider

`AI_DETERMINISTIC_E2E_PROVIDER=true` chỉ chấp nhận với `APP_ENV=test` hoặc `APP_ENV=e2e`; settings reject startup ở mọi môi trường khác. Provider dùng metadata fixture nhỏ, strict JSON parsing, production validator, Spring gateway, receipt persistence, frontend proxy; không mount/modify production corpus, embeddings, Chroma và không cần Gemini key.

## E2E và deployment readiness

Final offline reconciliation (2026-08-21): RAG-01 test 33 PASS, focused RAG-02 24 PASS, full AI suite 394 PASS/3 deselected/9 warnings, Ruff PASS, provider calls 0. The final frontend release gate passed 135/135 files and 1232/1232 tests, lint, TypeScript and production build. Accepted backend evidence is compile PASS, focused 47/47 PASS, and full suite 733 tests with 0 assertion failures, 2 Docker/Testcontainers environment errors and 87 skipped; it is not represented as 733/733 PASS.

Historical Goal 17A local release evidence (2026-07-30):

- Docker Desktop 4.61.0, Engine 29.2.1/API 1.53, Compose 5.0.2.
- Compose config pass; MySQL, AI Service, backend và frontend healthy.
- Deterministic Compose E2E 2/2 pass; no Gemini credential; cleanup pass.
- Backend 260 tests, 4 design-valid skip; 13/13 Testcontainers tests run/pass với 0 skip.
- Flyway applied and validated 38 migrations.
- AI Service 308 pass/3 live-smoke skip; frontend 536/536 pass.
- Coverage: app 90%, app/scripts 85%.

Các số liệu cũ hơn (Goal 13D) là historical evidence; khi khác nhau, snapshot Goal 17A này và
`GOAL15_BASELINE.md` là trạng thái hiện hành cho AI workflow (thời điểm 2026-07-30: 38 migrations).
Schema repository hiện tại đã lên V43 (V42 managed image, V43 dashboard index — thuộc module
Admin/Dashboard, không đổi AI contract); AI candidate workflow chỉ yêu cầu V38+.

### MySQL migration verification

- Testcontainers 1.21.3 chạy được trên Docker Desktop/Engine family với `-Dapi.version=1.44`; không dùng fallback DB cho final gate.
- 38 successful Flyway rows, V35–V38 succeeded; Spring reported schema version 38 current.
- Flyway warning tương thích MySQL 8.4 (bundle verification covers qua 8.1) — không migration nào fail.
- Metadata assertions verify 8 bảng Goal 13, 5 unique indexes, 6 foreign keys, version columns (reusable `AiMySqlMigrationIntegrationTest`).

### Deployment / runtime

- Packaging development/test only; containers non-root; health tách liveness khỏi optional SMTP.
- Frontend bundle không chứa internal FastAPI URL/token.
- Flyway enabled mặc định chỉ cho disposable E2E schema; production profiles disable uncontrolled Flyway.
- Live Gemini không chạy trong CI; deterministic pass không phải evidence cho provider latency/quality.

## History RAG artifact policy

`data/history-rag/v1` là external audited release package (workbook SHA
`001751243f659c449c6622ff7b417ad74fc12cf2f72dcf59305fad11bca6ee4c`, package SHA
`25fea8369332b6585cab9d81ca60e9dbae6b6ffcd7cc350600a6e4878246a529`); synthetic data
forbidden. Default tests dùng `HistoryRagTestPackageFixture` trong JUnit `@TempDir`
(self-contained). Protected manual workflow downloads approved artifact, validates fixed
hashes và chạy production reader.

## Security notes cho validation

- Chỉ sanitized JUnit và E2E summaries được giữ 7 ngày. Không upload env, key, token,
  password, full response/context/chunk, vector, production Chroma storage.
- Static job: coverage enforced từ local runner database nhưng không upload.
