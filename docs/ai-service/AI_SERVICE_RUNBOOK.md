# AI Service RAG — Runbook

> **Current local release gate — 2026-07-30.** Backend, AI Service, frontend,
> workflow/hygiene, deterministic Compose E2E, Testcontainers and secret
> scanning pass. The current evidence is local and deterministic; it does not
> call live Gemini and does not replace remote CI or production monitoring.

## Goal 13F teacher evaluation operations

Run no-provider validation from `ai-service/`: `python -m scripts.build_teacher_evaluation_sample --offline-preflight`. Only after explicit cost/quota approval use `--execute --allow-provider-call`; cache hits are reused, failures remain recorded, and no unbounded retry occurs. From repository root, export one offline package per `GVxx`, then import and analyze:

```powershell
python scripts/evaluation/export_teacher_review.py --sample artifacts/teacher-evaluation/sample.jsonl --output-dir artifacts/teacher-evaluation/GV01 --evaluator-id GV01 --seed '<controlled-study-seed>'
python scripts/evaluation/import_teacher_reviews.py --sample artifacts/teacher-evaluation/sample.jsonl --reviews '<approved-path>/teacher-reviews.csv' --output-dir artifacts/teacher-evaluation
python scripts/evaluation/analyze_teacher_reviews.py --sample artifacts/teacher-evaluation/sample.jsonl --reviews artifacts/teacher-evaluation/results/teacher-reviews.jsonl --output-dir artifacts/teacher-evaluation
```

The HTML is static and needs no Gemini key. Keep identity mappings outside Git. Import errors are corrected in the source form, never silently repaired. Without real reviews analysis exits `Teacher evaluation: NOT YET COLLECTED`; ratings never invoke approval or publish. See `AI_TEACHER_EVALUATION_PROTOCOL.md`.

> Goal 13D remains historical evidence. For a current deterministic verification
> run `.\scripts\e2e\run-ai-e2e.ps1 -Repeat 2` (or
> `./scripts/e2e/run-ai-e2e.sh --repeat 2`) only after the Docker daemon is
> healthy; the runner creates/cleans temporary secrets and writes reports under
> ignored `artifacts/e2e/`.

Các lệnh dưới đây chạy từ `D:/KLTN/lich-su-viet-nam-3d/ai-service` trên Python 3.10+.

## 1. Environment variables dự kiến

```env
AI_SERVICE_HOST=127.0.0.1
AI_SERVICE_PORT=8001
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSION=768
GEMINI_EMBEDDING_BATCH_SIZE=8
GEMINI_EMBEDDING_MAX_RETRIES=5
GEMINI_EMBEDDING_RETRY_MIN_SECONDS=1
GEMINI_EMBEDDING_RETRY_MAX_SECONDS=30
GEMINI_GENERATION_MODEL=gemini-2.5-flash
GEMINI_GENERATION_TEMPERATURE=0.3
GEMINI_GENERATION_MAX_OUTPUT_TOKENS=8192
GEMINI_GENERATION_MAX_RETRIES=3
GEMINI_GENERATION_REPAIR_ATTEMPTS=1
GEMINI_GENERATION_TIMEOUT_SECONDS=60
AI_SELF_PRACTICE_MODEL_ENABLED=false
AI_SELF_PRACTICE_MODEL=gemini-3.5-flash-lite
AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT=0
AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED=false
AI_SELF_PRACTICE_ROLLOUT_SALT=self-practice-v1
EMBEDDING_OUTPUT_DIR=./storage/embeddings
EMBEDDING_CHECKPOINT_DIR=./storage/checkpoints
CHROMA_PERSIST_DIR=./storage/chroma
CHROMA_COLLECTION_NAME=sgk_kntt_history_gemini_v1
CHROMA_DISTANCE_METRIC=cosine
CHROMA_UPSERT_BATCH_SIZE=50
CHROMA_REPORT_DIR=./storage/chroma-reports
SGK_CHUNKS_PATH=./data/corpus/sgk_chunks.jsonl
RAG_INCLUDE_PENDING_REVIEW=false
RAG_DEFAULT_TOP_K=5
RAG_MAX_TOP_K=10
QUIZ_DEFAULT_COUNT=5
QUIZ_MAX_COUNT=10
QUIZ_MAX_STYLE_EXAMPLES=3
QUIZ_MAX_STYLE_EXAMPLE_CHARS=12000
QUIZ_MAX_QUESTION_LENGTH=500
QUIZ_MAX_OPTION_LENGTH=300
QUIZ_MAX_EXPLANATION_LENGTH=1500
QUIZ_DUPLICATE_SIMILARITY_THRESHOLD=0.9
QUIZ_ALLOW_PENDING_REVIEW=false
LOG_LEVEL=INFO
```

`GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE` is a benchmark/evaluation CLI
input, not the runtime canary selector. Runtime self-practice routing reads
`AI_SELF_PRACTICE_MODEL`; setting only the benchmark variable does not route
student traffic.

### Self-practice model canary

Candidate routing is internal and applies only to authenticated `SELF_PRACTICE`
requests. Assignment is deterministic from a pseudonymous user identifier and the
rollout salt. Admin review, evaluation, and other internal generation always remain
on the current model. Current and candidate use independent provider pools; the
initial rollout intentionally has no cross-model fallback.

The Spring backend derives the internal canary subject with HMAC-SHA256. Configure a
dedicated `AI_SELF_PRACTICE_CANARY_SECRET`; never reuse the JWT secret, internal
service token, or Gemini API key. If the authenticated principal or this secret is
missing, the subject is omitted and routing fails closed to the current model. The
raw user identifier, HMAC subject, and secret are never routing-log fields.

The safe deployment defaults are `AI_SELF_PRACTICE_MODEL_ENABLED=false` and
`AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT=0`. Do not enable the candidate merely by
setting its model name. After separate approval and monitoring at each stage, use
the sequence `0 -> 5 -> 25 -> 50 -> 100`; rollback is setting the percentage to `0`
and then disabling the feature. Keep the rollout salt stable during an experiment,
and rotate it only when intentionally creating a new cohort.

#### Local/staging activation

Chỉ kích hoạt trên local/staging bằng tài khoản thử nghiệm đã được phê duyệt.
Backend và AI Service đọc cấu hình lúc khởi động; thay environment mà không
restart sẽ không đổi cohort hoặc model đang chạy.

Backend:

```powershell
$env:AI_SELF_PRACTICE_CANARY_SECRET='<dedicated-random-hmac-secret>'
```

AI Service — chuẩn bị candidate ở 0% trước:

```powershell
$env:GEMINI_GENERATION_MODEL='gemini-2.5-flash'
$env:AI_SELF_PRACTICE_MODEL='gemini-3.5-flash-lite'
$env:AI_SELF_PRACTICE_MODEL_ENABLED='true'
$env:AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT='0'
$env:AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED='false'
$env:AI_SELF_PRACTICE_ROLLOUT_SALT='self-practice-v1'
```

Restart Spring khi thay `AI_SELF_PRACTICE_CANARY_SECRET`. Restart AI Service
khi thay model, flag, percentage, fallback hoặc salt. Sau khi 0% pass health và
smoke, đặt percentage thành `5`, restart AI Service, theo dõi rồi mới lần lượt
xét `25`, `50`, `100`. Không dùng giá trị trung gian khác.

`GEMINI_API_KEY` hiện cung cấp pool key cho provider runtime; current và
candidate có provider pool/thread-local lifecycle độc lập nhưng không được
fallback chéo model. Không đưa key vào command history dùng chung hoặc tài liệu.

#### Rollback

Rollback ưu tiên routing trước:

```powershell
$env:AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT='0'
# Restart AI Service và xác minh mọi SELF_PRACTICE request về current.
$env:AI_SELF_PRACTICE_MODEL_ENABLED='false'
# Restart AI Service lần nữa để khóa candidate.
```

Không đổi rollout salt trong rollback đang diễn ra. Không bật
`AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED`; config hiện fail startup nếu giá trị
này là `true`.

#### Health, readiness và observability

```powershell
Invoke-RestMethod http://127.0.0.1:8001/ai/health
Invoke-RestMethod 'http://127.0.0.1:8001/ai/health?deep=true'
```

Shallow health không gọi Gemini. Deep health mở runtime collection và với
artifact production hợp lệ phải trả `status=READY`, `contractReady=true`,
`recordCount=414`; contract không sẵn sàng trả 503 cùng error code đã sanitize.
Health không chứng minh một live generation sẽ không gặp quota/timeout.

Routing telemetry chỉ được dùng các field phân loại thấp cardinality như
`generationUseCase`, `modelClass`, `canaryAssigned`, bucket group và reason.
Không log raw user ID, `canarySubject`, HMAC secret/salt, API key, prompt, Fact
Context, chunk text hoặc model ID vào public log/response.

Before any staging activation, run the offline rehearsal from `ai-service/`:

```powershell
python -m scripts.rehearse_self_practice_rollout `
  --output-root ../artifacts/ai-service/goal15p `
  --run-id <sanitized-run-id>
```

The expected status is `LOCAL_STAGING_ACTIVATION_REHEARSAL_PASS`. The harness uses
deterministic recording services only, performs no Gemini calls, and writes
content-free artifacts outside the commit. A 100% to 0% rehearsal is only a local
configuration/restart-cycle measurement, not a production recovery-time claim.

`GEMINI_API_KEY` chấp nhận một key hoặc nhiều key phân cách bằng dấu phẩy. Không thêm dấu ngoặc/quote vào từng key. CLI chỉ báo count/position, không in giá trị. Nếu dùng pool, provider failover cho `API_KEY_INVALID`/401/403; key position 1 hiện bị project denial và position 2 đã pass.

Không commit `.env`. Chỉ commit `.env.example`.

Key phải được cấp qua environment hoặc `.env` local đã ignore. Không in hoặc đưa key vào lệnh/documentation.

## 2. Setup dự kiến

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

Chỉ cài runtime production: `python -m pip install -r requirements.txt`.

## 3. Validate dữ liệu

```powershell
python -m scripts.validate_corpus
```

Kết quả đã xác minh ngày 2026-07-19:

- 459 tổng, 414 eligible, 45 pending review.
- 0 duplicate `chunkId`, 0 invalid record.
- Report: `data/corpus/runtime_validation_report.json`.

## 4. Chạy test

```powershell
python -m pytest
```

Test không gọi mạng, Gemini hoặc ChromaDB.

## 5. Chạy service

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

## 6. Smoke tests

```powershell
curl.exe http://127.0.0.1:8001/ai/health
```

```powershell
Invoke-RestMethod http://127.0.0.1:8001/ai/health
```

## 7. Build Gemini embeddings

Trước smoke, chạy diagnostic tuần tự và dừng ngay ở lỗi đầu tiên:

```powershell
python -m scripts.diagnose_gemini_embedding --mode plain
python -m scripts.diagnose_gemini_embedding --mode single-content
python -m scripts.diagnose_gemini_embedding --mode multi-content
python -m scripts.diagnose_gemini_embedding --mode corpus --limit 1
```

CLI chỉ in trạng thái key dạng boolean/count/position, backend, custom-base-url boolean, model/dimension, counts/dimensions và provider error đã sanitize. Không in key hoặc full corpus text. Trạng thái 2026-07-20: cả bốn mode pass bằng key position 2.

Dry-run, không cần key và không ghi production artifacts:

```powershell
python -m scripts.build_embeddings --dry-run
python -m scripts.build_embeddings --dry-run --limit 3
```

Chỉ sau khi cả bốn diagnostic pass, chạy smoke và resume theo thứ tự:

```powershell
python -m scripts.build_embeddings --limit 1 --force
python -m scripts.build_embeddings --limit 3 --force
python -m scripts.build_embeddings --limit 3
```

Gate tương ứng: smoke 1 có 1 vector/0 failure; smoke 3 có 3 vector/0 failure; lần resume có `alreadyCompleted=3`, `newlyEmbedded=0`.

Full run chỉ sau khi smoke output được review và người dùng phê duyệt:

```powershell
python -m scripts.build_embeddings
```

Resume là mặc định; có thể ghi rõ:

```powershell
python -m scripts.build_embeddings --resume
```

Nếu còn lỗi tạm thời, chạy tối đa ba resume pass và dừng khi một pass không tăng `successfulRecords`. Sau mỗi pass ghi `successfulRecords`, `newlyEmbedded`, `unresolvedFailedRecords`, `unattemptedRecords`, `remainingRecords`, `status`. Failure đã resolve phải biến mất khỏi `embedding_failures.jsonl`.

Force re-embed phải dùng chủ động:

```powershell
python -m scripts.build_embeddings --force
```

Pending review chỉ được bật rõ ràng:

```powershell
python -m scripts.build_embeddings --include-pending-review --limit 3
```

Output:

```text
storage/embeddings/gemini-embedding-2-768/
storage/checkpoints/gemini-embedding-2-768/
```

## 8. Build và inspect Chroma index

Artifact-only dry-run; không tạo Chroma client/storage:

```powershell
python -m scripts.build_chroma_index --dry-run
```

Smoke index sau khi dry-run pass:

```powershell
python -m scripts.build_chroma_index --limit 3
python -m scripts.inspect_chroma_index
```

Full idempotent index:

```powershell
python -m scripts.build_chroma_index
python -m scripts.inspect_chroma_index
```

Recreate là destructive đối với đúng configured collection và không được dùng mặc định:

```powershell
python -m scripts.build_chroma_index --recreate
```

Output:

```text
storage/chroma/
storage/chroma-reports/sgk_kntt_history_gemini_v1-index-report.json
```

Production hiện tại: embedding artifact 414 unique records × 768, zero failures, manifest `COMPLETED`; Chroma collection `sgk_kntt_history_gemini_v1` có 414 records, cosine. Dry-run/smoke/full/idempotent/reopen đều pass.

Manifest status:

- `IN_PROGRESS`: process đang chạy.
- `PARTIAL`: còn unattempted, chưa có unresolved failure.
- `PARTIAL_WITH_ERRORS`: còn unattempted và có unresolved failure.
- `COMPLETED_WITH_ERRORS`: mọi selected record đã attempted nhưng còn unresolved failure.
- `COMPLETED`: mọi selected record có valid embedding, zero unresolved.
- `FAILED`: lỗi hệ thống/run-fatal khiến không thể tiếp tục.

## 9. Checklist trước demo

- [x] Health endpoint UP cho Goal 7A/7B.
- [x] Index count đúng.
- [x] Retrieval test pass ngưỡng.
- [x] Không dùng pending-review chunks ngoài policy.
- [x] Gemini structured output pass.
- [x] Không có API key trong git diff/log.
- [x] Spring integration test pass.
- [ ] Frontend build/typecheck pass.

## 10. Khi gặp lỗi

Ghi vào `AI_SERVICE_STATUS.md`:

- Exact command.
- Full error message đã loại secret.
- Branch/commit.
- Environment version.
- File bị ảnh hưởng.
- Cách tái hiện.
- Điều đã thử.

## 11. Retrieval và evaluation — Goal 8

Khởi động API:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Manual query:

```powershell
python -m scripts.query_retrieval --query "Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945" --grade 12 --lesson-number 6 --top-k 5 --show-context
```

CLI hỗ trợ `--grade`, `--lesson-number`, `--document-id`, `--top-k`, `--json`, `--show-context`; chỉ query read-only, không in key/vector.

Debug API:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8001/ai/retrieval/debug -ContentType application/json -Body '{"query":"Nguyên nhân thắng lợi của Cách mạng tháng Tám","grade":12,"lessonNumber":6,"topK":5}'
```

Evaluation/resume:

```powershell
python -m scripts.evaluate_retrieval
```

Cache atomic nằm tại `storage/evaluation-cache/`; cùng query/model/dimension/formatter sẽ resume không gọi embedding lại. Không đổi model hoặc rebuild document embeddings khi quota tạm thời; tối đa ba resume pass khi có tiến triển. Report runtime ở `storage/evaluation-reports/retrieval-evaluation.json` và `.md`.

Production smoke automated chỉ chạy khi `RUN_PRODUCTION_RETRIEVAL_SMOKE=1`; thiếu Gemini key hoặc Chroma thì skip. Kiểm tra filter, ID trùng, finite distance, ordered source IDs và collection count không đổi.

## 12. Grounded generation — Goal 9

Service có thể khởi động khi generation model/key trống; khi đó `generationReady=false` và endpoint trả lỗi an toàn. Health không gọi Gemini. Production dùng `gemini-2.5-flash`; nếu `.env` local đang để model trống, đặt process environment trước khi smoke:

```powershell
$env:GEMINI_GENERATION_MODEL='gemini-2.5-flash'
```

Sinh thủ công, không persist:

```powershell
python -m scripts.generate_quiz --query "Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945" --grade 12 --lesson-number 6 --difficulty MEDIUM --count 3 --top-k 5 --show-sources
```

Dùng style fixture chỉ cho test/evaluation:

```powershell
python -m scripts.generate_quiz --query "Vai trò của tri thức lịch sử" --grade 10 --difficulty MEDIUM --count 2 --style-examples-file tests/fixtures/style_examples.json --json
```

API nội bộ:

```powershell
$body = @{query='Nguyên nhân thắng lợi của Cách mạng tháng Tám'; grade=12; lessonNumber=6; difficulty='MEDIUM'; count=1; topK=5; styleExamples=@()} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8001/ai/quiz/generate -ContentType application/json -Body $body
```

Production smoke automated chỉ chạy khi bật rõ:

```powershell
$env:RUN_PRODUCTION_GENERATION_SMOKE='1'
python -m pytest tests/integration/test_production_generation_smoke.py -q
```

Evaluation 12 case và resume cache:

```powershell
python -m scripts.evaluate_generation
python -m scripts.evaluate_generation
```

Cache ở `storage/generation-cache/`; report ở `storage/evaluation-reports/generation-evaluation.json` và `.md`, đều Git-ignored. Pass production đã xác minh: pass đầu 12 miss/12 success, pass hai 12 hit/0 miss; các structural/source metrics đạt 1.0, duplicate/partial/insufficient 0.0. Tất cả 22 câu vẫn phải manual review; warning tên riêng/ngày tháng không phải correctness score.

Không xóa cache để tạo thêm provider calls khi report hiện tại đã đủ gate. Không in prompt, key, vector hoặc raw response. Khi 429/quota xảy ra, dừng evaluation nếu không có tiến triển; không rebuild embedding/index và không chuyển key vì generation quota.

## 13. Spring Boot integration — Goal 10

Backend environment mẫu:

```env
AI_SERVICE_ENABLED=true
AI_SERVICE_BASE_URL=http://127.0.0.1:8001
AI_SERVICE_CONNECT_TIMEOUT=5s
AI_SERVICE_READ_TIMEOUT=90s
AI_SERVICE_GENERATION_PATH=/ai/quiz/generate
AI_SERVICE_HEALTH_PATH=/ai/health
AI_SERVICE_MAX_STYLE_EXAMPLES=3
```

Gemini key không được đặt trong backend. Khởi động FastAPI trước, xác nhận health một lần cho diagnostics:

```powershell
cd D:/KLTN/lich-su-viet-nam-3d/ai-service
$env:GEMINI_GENERATION_MODEL='gemini-2.5-flash'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
Invoke-RestMethod http://127.0.0.1:8001/ai/health
```

Khởi động Spring:

```powershell
cd D:/KLTN/lich-su-viet-nam-3d/backend
.\mvnw.cmd spring-boot:run
```

Public self-practice smoke cần JWT/cookie authenticated:

```powershell
$body = @{query='Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945'; difficulty='MEDIUM'; count=1} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/api/quiz/generate -Headers @{Authorization="Bearer <local-test-token>"} -ContentType application/json -Body $body
```

Spring tự đặt `topK=5`, bỏ grade/lesson/document và gửi
`generationUseCase=SELF_PRACTICE` cùng canary subject giả danh sang FastAPI.
Luồng này không tạo generation receipt hoặc candidate. Chỉ dùng
`/api/exams/ai/generate` khi kiểm tra contract compatibility/admin cũ.

Test offline và gated H2 → FastAPI smoke:

```powershell
.\mvnw.cmd -q "-Dtest=*Ai*Test" test
$env:RUN_SPRING_AI_SMOKE='1'
.\mvnw.cmd -q "-Dtest=AiSpringFastApiSmokeTest" test
```

Gated smoke gọi count 1 rồi 3 và assert count `exam_questions`/`exam_mcq_options` không đổi. Không bật cờ trong CI không có FastAPI/key; test mặc định skip và không gọi production.

Troubleshooting:

- `AI_SERVICE_DISABLED`: kiểm tra `AI_SERVICE_ENABLED`.
- `AI_SERVICE_UNAVAILABLE`: kiểm tra FastAPI listen/base URL/health; không retry request thủ công hàng loạt.
- `AI_SERVICE_TIMEOUT`: giữ read timeout lớn hơn Gemini timeout; không tự động resend.
- `AI_SERVICE_INVALID_RESPONSE`: kiểm tra protocol; client phải là HTTP/1.1 với Uvicorn local.
- `AI_STYLE_EXAMPLES_UNAVAILABLE`: kiểm tra datasource/active exam dataset; zero eligible example tự thân vẫn hợp lệ.
- Default backend suite không phụ thuộc `data/history-rag/v1`; canonical package
  chỉ bắt buộc cho release-artifact validation riêng.

## 14. Frontend AI quiz — Goal 11

Khởi động frontend sau FastAPI và Spring:

```powershell
cd D:/KLTN/lich-su-viet-nam-3d/frontend
npm ci
npm run dev
```

Đăng nhập, mở `http://localhost:5173/quiz/generate`, nhập chủ đề/độ khó/số câu rồi generate. Network phải chỉ có đúng một `POST /api/quiz/generate` tới Vite proxy/Spring; không có request browser tới port 8001. Không gửi grade/lesson/document/topK từ browser. Source chỉ hiện sau nộp; hủy chờ không retry.

Verification frontend:

```powershell
npx tsc -b --pretty false
npm run test -- --run
npm run build
```

Troubleshooting:

- 401: đăng nhập lại; generation không được replay tự động sau refresh.
- `AI_INSUFFICIENT_CONTEXT`: cụ thể hóa chủ đề/yêu cầu; retrieval của luồng này
  tìm trên toàn bộ SGK lớp 10–12.
- `AI_SERVICE_TIMEOUT`/`AI_SERVICE_UNAVAILABLE`: kiểm tra Spring và FastAPI; frontend không tự retry.
- Component/API tests phải mock public Spring response, không mock FastAPI trong
  browser layer.
- Không thêm `VITE_GEMINI_API_KEY`, FastAPI URL hoặc official exam submit vào
  flow này. Session/result/history tự học dùng localStorage có kiểm tra user.

## Goal 13 operations

Assign `teacher` explicitly in `user_roles`; migrations do not assign it to users. Configure the same strong `AI_SERVICE_INTERNAL_TOKEN` in Spring and FastAPI, distinct from Gemini/JWT secrets, and coordinate rotation/restart; never print the header.

Receipt settings are `AI_RECEIPT_RETENTION_HOURS` (24), `AI_RECEIPT_CLEANUP_CRON` (`0 17 * * * *`), `AI_RECEIPT_CLEANUP_BATCH_SIZE` (100), and `AI_RECEIPT_CLEANUP_ENABLED`. Validity remains 30 minutes. Monitor `ai.receipt.cleanup.runs`, `.deleted`, and `.failures`; logs contain counts only. For provenance errors, verify identity fields, chunk hash/pending state, token parity and AI Service reachability. Never bypass validation or overwrite stored hashes; regenerate/create a new candidate. Apply V36 to a backed-up non-production MySQL database before traffic.

## Review workflow smoke run

Use a non-production MySQL database migrated through V38 and a hidden `REVIEW_REQUIRED` test definition. Exercise candidate creation through the receipt-aware compatibility API or a controlled fixture, then edit, submit, approve and confirm publish through the admin candidate UI/API. Verify four official options/one correct answer, repeat publish and confirm no duplicate, inspect the audit timeline, verify teacher permissions and admin-only publish, and confirm a student receives 403 for candidate routes. Do not publish to a public definition. If MySQL or authenticated services are unavailable, run unit/mock integration suites and report real E2E as not run.

## Revision smoke and incident checks

In a non-production hidden/review-required target, open a published candidate, create revision 2, confirm the parent is unchanged, search/select/remap a canonical source with a reason, submit, approve as a different reviewer, verify teacher publish is denied, and publish as admin. Assert a new official ID/four options/one correct, old official bytes unchanged, chain/head moved, open cleared, and repeated publish creates nothing. Race two create/publish requests and expect one success plus a sanitized conflict. For stale base/head, do not merge: reload and create from the current head. Never log the internal token or full excerpts.

## WP18 local release gates and History RAG package tests

Run the default backend suite from `backend/`; it is independent of a checkout
relative artifact path:

```powershell
.\mvnw.cmd clean test
.\mvnw.cmd "-Dtest=HistoryRagPackageReaderTest" test
```

When an approved canonical package has been downloaded and passed the fixed
hash preflight, exercise the same production reader explicitly:

```powershell
.\mvnw.cmd "-Dtest=HistoryRagPackageReaderTest" "-Dhistory.rag.package.dir=../data/history-rag/v1" test
```

The default test creates a deterministic test-only package in JUnit `@TempDir`
and verifies the full production baseline counts, schema, checksums, and
invariants. It must not write synthetic data into `data/history-rag/v1`.

For the remaining container gate:

```powershell
docker info
cd D:/KLTN/lich-su-viet-nam-3d
.\scripts\e2e\run-ai-e2e.ps1 -Repeat 2
```

Runner tương đương trong CI/Linux:

```powershell
python scripts/e2e/run_ai_e2e.py --repeat 2
```

Compose dùng `APP_ENV=e2e` và
`AI_DETERMINISTIC_E2E_PROVIDER=true`; fake provider chỉ được phép ở
`test`/`e2e`, không được bật ở development/staging/production.

Testcontainers trên Docker Desktop/Engine 29:

```powershell
cd D:/KLTN/lich-su-viet-nam-3d/backend
.\mvnw.cmd "-Dapi.version=1.44" "-Dtest=AiMySqlMigrationIntegrationTest" test
.\mvnw.cmd "-Dapi.version=1.44" "-Dtest=HistoryRagSchemaMigrationIntegrationTest,HistoryRagDryRunIntegrationTest,HistoryRagImportServiceIntegrationTest" test
```

Deterministic fake-provider và canary contract không cần Gemini:

```powershell
cd D:/KLTN/lich-su-viet-nam-3d/ai-service
python -m pytest tests/integration/test_deterministic_e2e_provider.py tests/unit/test_generation_routing.py tests/unit/test_self_practice_rollout_rehearsal.py -q

cd ../backend
.\mvnw.cmd "-Dtest=AiCanarySubjectPseudonymizerTest,AiQuizGenerationServiceTest,HttpAiQuizClientTest,PracticeQuizPublicContractTest" test
```

Main CI không gọi live Gemini. Live-provider smoke phải là workflow thủ công,
được bảo vệ, không chạy trên pull request/fork và không in response. Không đặt
`GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE` để kích hoạt production:
biến đó chỉ được script benchmark đọc; runtime đọc `AI_SELF_PRACTICE_MODEL`.

Exact local release sequence đã chạy thành công trên Docker Desktop/Engine 29:

```powershell
cd D:/KLTN/lich-su-viet-nam-3d
docker context show
docker version
docker info
docker compose version

# Set three temporary, untracked values in the current process:
# AI_E2E_MYSQL_PASSWORD, AI_E2E_JWT_SECRET, AI_E2E_INTERNAL_TOKEN.
docker compose -f compose.ai-e2e.yml config --quiet
docker compose -f compose.ai-e2e.yml config --services
docker compose -f compose.ai-e2e.yml config --networks
docker compose -f compose.ai-e2e.yml config --volumes

.\scripts\e2e\run-ai-e2e.ps1 -Repeat 2

cd backend
.\mvnw.cmd "-Dapi.version=1.44" clean test
.\mvnw.cmd compile
```

Runner thực hiện build/up, chờ health hữu hạn, chạy E2E, rồi dùng
`docker compose down -v --remove-orphans`. `-v` ở đây chỉ xóa volume
`lichsuvn-ai-e2e_ai-e2e-mysql` do project test tạo; không thay bằng
`docker system prune` hoặc lệnh prune toàn máy. Sau cleanup, xác minh:

```powershell
docker ps -a --filter "label=com.docker.compose.project=lichsuvn-ai-e2e"
docker volume ls --filter "label=com.docker.compose.project=lichsuvn-ai-e2e"
docker network ls --filter "label=com.docker.compose.project=lichsuvn-ai-e2e"
```

Kết quả chuẩn hiện tại: Compose config pass; `mysql`, `ai-service`, `backend`,
`frontend` healthy; E2E 2/2 pass; 13 Testcontainers tests pass và 0 skip;
cleanup không còn container, volume hoặc network của project. Bốn backend skip
còn lại là FastAPI/WP10 smoke, external canonical-package variant và FFmpeg,
không phải Testcontainers skip.

Shallow Compose health không gọi Gemini. Deep readiness của production Chroma
phải được đối chiếu với locked invariant: collection
`sgk_kntt_history_gemini_v1`, 414 records, model `gemini-embedding-2`,
768 dimensions, cosine và corpus SHA-256
`a4bd330be7b4b43ac9da25966877fef51c66c0e14cc68baa7eccf46a63e15ab2`.
Không rebuild Chroma để làm cho gate pass.
