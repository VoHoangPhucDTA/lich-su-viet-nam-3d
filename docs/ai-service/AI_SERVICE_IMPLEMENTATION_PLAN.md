# AI Service RAG — Implementation Plan

## Goal 13F — teacher evaluation and thesis experiment

Status: tooling complete; real data collection not started; analysis not available. The v1 manifest fixes 36 requests (12 per grade, 4 per difficulty per grade) before ratings. The gate includes failure-preserving generation, deterministic blinded export, rubric/schema, strict import, Wilson intervals, missing-aware pairwise agreement, locked warning matrix, ignored runtime output, synthetic no-provider smoke, and protocol/thesis documentation. No rating changes candidate state or publishes content. Next manual phase is approved sample generation and teacher review; synthetic data is never a thesis result.

> Goal 13D completed locally without production deployment. Goal 13E implementation and verification are tracked in `AI_SERVICE_CI_AND_TEST_STRATEGY.md`; these changes remain uncommitted.

## Nguyên tắc triển khai

- Audit project trước khi sửa code.
- Không làm lại bước HTML → chunk nếu artifact hiện có đạt audit.
- `sgk_chunks.jsonl` là nguồn canonical cho indexing.
- Không trộn vector từ hai embedding model trong cùng collection.
- SGK là nguồn sự thật; câu hỏi đề thi chỉ là style examples.
- React không gọi Gemini hoặc ChromaDB trực tiếp.
- Mỗi Goal có gate rõ ràng trước khi sang Goal kế tiếp.

## Goal 7A — Dựng nền FastAPI AI Service

**Trạng thái: DONE (2026-07-19)**

- [x] Tạo package `app/` theo lớp API, schema, corpus và core.
- [x] Typed settings đọc environment và `.env` không bắt buộc.
- [x] Tạo `GET /ai/health`; không khởi tạo Gemini/Chroma ở import time.
- [x] Tối giản dependency trực tiếp và tách dependency test.
- [x] Unit test config/health không cần mạng hoặc API key.

Gate: 8/8 test pass và Uvicorn health smoke test pass.

## Goal 7B — Onboard và validate corpus SGK

**Trạng thái: DONE (2026-07-19)**

- [x] Xác nhận canonical corpus và ba report tại `data/corpus/`.
- [x] Model bám schema của record thật, gồm `contentTypes` và page nullable.
- [x] Loader JSONL UTF-8 theo từng dòng, có line number khi lỗi.
- [x] Validator kiểm tra schema, ID trùng và phân loại pending review.
- [x] CLI ghi `runtime_validation_report.json` và trả exit code phù hợp.
- [x] Unit test loader/validator và validation corpus thật.

Gate: 459 record, 414 eligible, 45 pending, 0 duplicate, 0 invalid; status `PASSED`.

## Goal 7C — Gemini embedding provider và resumable pipeline

**Trạng thái: DONE_PRODUCTION (2026-07-20)**

- [x] Xác minh `gemini-embedding-2`, dimension 768 và SDK chính thức 2.12.1.
- [x] Lazy Gemini provider; một `types.Content` cho mỗi input.
- [x] Asymmetric formatter `gemini-retrieval-document-v1`.
- [x] Retry có giới hạn cho 429/5xx/timeout/transport; không retry lỗi permanent.
- [x] Atomic artifact store, checkpoint/resume key đầy đủ và truncated-tail recovery.
- [x] CLI dry-run/limit/resume/force/include-pending-review.
- [x] Final full suite: 78 pass, 1 integration skip; unit tests không gọi mạng.
- [x] Dry-run corpus thật: 459 total, 414 eligible, 45 skipped.
- [x] Diagnostic/error repair: safe full provider details, explicit Developer API, validated request builders và formatter guard.
- [x] Parse comma-separated key pool; key-specific failover không làm thay đổi retry/content-error policy.
- [x] `plain` → `single-content` → `multi-content` → `corpus --limit 1` đều pass.
- [x] External smoke 1 → 3 → resume: `1/1`, `3/3`, rồi `alreadyCompleted=3/newlyEmbedded=0`; 0 failure, dimension 768.
- [x] Full run: 414 eligible vectors, zero unresolved failures; hai resume pass.
- [x] Batch failure continuation, bounded request-error bisection và failure resolution.
- [x] Manifest progress/status semantics đầy đủ và strict artifact validation.

Gate code/dry-run/API/full production artifact: PASSED.

Production result: 414 records × 768, zero failures, pending review excluded.

## Goal 7D — Persistent ChromaDB index

**Trạng thái: DONE_PRODUCTION (2026-07-20)**

- [x] Pin `chromadb==1.5.9`, tương thích Python 3.10.11.
- [x] Strict production artifact validator trước client creation.
- [x] Persistent client, cosine collection contract và explicit precomputed vectors.
- [x] Deterministic flattened record metadata; nullable pages omitted.
- [x] Idempotent batch upsert và collection compatibility checks.
- [x] `--recreate` chỉ xóa đúng configured collection khi được yêu cầu rõ ràng.
- [x] Build/inspect CLI và atomic index report.
- [x] Unit/integration tests: 51 pass; persistence reopen và second-run count stable.
- [x] Production dry-run pass với 414 artifact records.
- [x] Smoke index và inspect: count 3, dimension 768, cosine.
- [x] Full index và inspect: 414 unique IDs.
- [x] Idempotent rerun: before/after 414/414.
- [x] Persistence reopen: separate inspect process giữ count 414.

Gate code, production artifact, index và persistence: PASSED.

Exact next action: Goal 8 retrieval debug/service và evaluation trên collection production; không thay đổi embedding/index contract nếu chưa version lại.

## Goal 8 — Retrieval service, Fact Context và evaluation

**Trạng thái: DONE_PRODUCTION (2026-07-20)**

- [x] Typed request/response, exact filters và raw cosine distance.
- [x] Query formatter `gemini-retrieval-query-v1`, Gemini query vector 768 chiều và read-only Chroma query bằng precomputed embedding.
- [x] Stable deduplicate/diversify với fallback; deterministic Fact Context tối đa 12.000 ký tự/5 chunk.
- [x] `POST /ai/retrieval/debug`, manual CLI và health `retrievalReady`.
- [x] Engineering benchmark 36 query: 12 query mỗi lớp, đủ 9 category và có corpus evidence.
- [x] Cache identity theo query hash/model/dimension/formatter; resume xác nhận 36/36 cache hit.
- [x] Baseline: strict chunk Hit@1 `0.888889`, Hit@3/5 `1.0`, MRR `0.944444`; toàn bộ invariant bắt buộc đạt.
- [x] Full suite `98 passed, 2 skipped`; production smoke 6 loại query và debug API pass.

Gate: PASSED. Không rebuild embedding/index, không dùng generation model, không sửa Spring Boot/frontend.

Exact next action cho Goal 9: review bốn rank-1 miss, sau đó thiết kế generation contract và validation chỉ dựa trên sourceChunkIds của Fact Context; chưa ghi câu sinh vào ngân hàng đề.

## Goal 9 — Grounded generation, validation và evaluation

**Trạng thái: DONE_PRODUCTION (2026-07-20)**

- [x] Review bốn rank-1 miss: cùng document/lesson, expected chunk ở rank 2 và top 3 đủ làm ngữ cảnh.
- [x] Chọn `gemini-2.5-flash`; structured JSON schema, prompt/schema version và config typed.
- [x] Prompt tách FACT CONTEXT khỏi STYLE EXAMPLES; style chỉ hướng dẫn cách viết, không là nguồn sự thật.
- [x] Strict parser và validator cho bốn option A–D, một đáp án, độ dài, difficulty, source subset, option/source duplicate và warning evidence.
- [x] Duplicate check deterministic trong batch/với style examples, không tạo collection hoặc embedding mới.
- [x] Tối đa một repair có mục tiêu; cho partial có warning khi còn câu hợp lệ, fail khi không còn câu hợp lệ.
- [x] `POST /ai/quiz/generate`, CLI, fake provider, unit/integration/production smoke tests; không persist câu hỏi.
- [x] Benchmark production 12 case và cache identity theo request/source/model/prompt/schema/temperature/style.
- [x] Pass đầu 12/12 success; mọi structural/source metric bắt buộc đạt 1.0, duplicate/partial/insufficient 0.0; 22 câu chờ manual review.
- [x] Pass hai 12/12 cache hit, zero generation call; quality metrics giữ nguyên.

Gate: PASSED cho phạm vi AI Service. Cảnh báo tên riêng là tín hiệu review, không phải xác nhận factuality; chưa có expert-labelled correctness score.

Exact next action Goal 10: tích hợp Spring Boot làm gateway, lấy 2–3 câu verified từ MySQL làm Style Examples và map error/timeout; không cho FastAPI truy cập MySQL trực tiếp.

## Goal 10 — Spring Boot gateway cho AI quiz

**Trạng thái: DONE_WITH_BASELINE_LIMITATION (2026-07-20)**

- [x] Audit JWT/security, response/error convention, config, HTTP client và versioned exam bank.
- [x] Typed `app.ai-service` config; base URL từ environment, timeout 5s/90s, max 3 styles.
- [x] Read-only Style Example query từ active/public/verified MCQ, đúng A–D/một đáp án, stable ordering.
- [x] Tách public DTO khỏi internal FastAPI DTO; frontend không truyền Style Examples/raw context/model/key.
- [x] JDK HTTP client HTTP/1.1, correlation ID, typed response/error, không automatic retry.
- [x] Service orchestration, defensive response validation, partial/warning policy và zero-result rejection.
- [x] Authenticated `POST /api/exams/ai/generate`, dùng `ApiResponse<T>` và error handler hiện có.
- [x] Micrometer counters/timer; safe structured logs không chứa question/style/context/JWT/body.
- [x] Unit, repository, client và controller tests; offline 16 pass, gated smoke mặc định skip.
- [x] Full Spring route → FastAPI smoke count 1/3 pass trên H2 isolated verified bank; no-persistence counts pass.
- [x] AI Service regression 112 pass/3 skip; Chroma inspect 414; không sửa AI pipeline.

Gate Goal 10: PASSED cho code integration. Full repository suite vẫn có một baseline error ngoài phạm vi vì thiếu `data/history-rag/v1`; live JWT/MySQL smoke còn là environment limitation, không phải lỗi Goal 10.

Exact next action Goal 11: tích hợp frontend với public Spring contract; không gọi FastAPI trực tiếp.

## Goal 11 — Frontend AI quiz memory-only

**Trạng thái: DONE_WITH_REAL_E2E_LIMITATION (2026-07-20)**

- [x] Audit React 19/TypeScript/Vite/npm, React Router, HttpOnly-cookie API client và module luyện thi.
- [x] Authenticated route `/exams/ai` và entry “Tạo bài luyện tập bằng AI” trong trang luyện thi.
- [x] Typed public request/response, strict defensive parser và adapter sang `MCQQuestion` với temporary `ai-*` ID.
- [x] Form query/grade/optional lesson/difficulty/count bám bounds Spring; `topK=5` chỉ ở API layer.
- [x] Loading không phần trăm giả, AbortController, one in-flight request và `apiPostOnce` không replay generation.
- [x] Full/partial/error UX; manual-review warning chỉ tạo thông báo tự động chung, không khẳng định factual error.
- [x] Tái sử dụng `MCQQuestionCardV2`, `ExamQuickNavigator`, `ExamPracticeHeader`; chấm điểm, restart và result chạy local.
- [x] Source chỉ hiển thị sau submit; nullable page và deduplicate label an toàn.
- [x] Memory-only: không gọi save/create/official submit, không localStorage/sessionStorage/IndexedDB.
- [x] Unit/component mock-Spring tests, typecheck và production build pass.

Gate Goal 11: pass cho frontend code và mock Spring integration. Real browser E2E với authenticated cookie/MySQL/FastAPI chưa chạy vì local MySQL/JWT test session chưa sẵn sàng; không tuyên bố full E2E pass.

Exact next action Goal 12: thiết kế teacher review/publish workflow có provenance và audit rõ ràng trước khi cho phép persist bất kỳ câu AI nào; không auto-publish vào official bank.

---

## Goal 0 — Audit repository và chốt integration contract

### Mục tiêu

Hiểu project hiện tại mà chưa sửa code production.

### Công việc

- Xác minh repository root, branch, commit và working tree.
- Xác định module frontend, backend, build tools và runtime version.
- Tìm cấu trúc auth, error response, CORS, config, logging, test.
- Audit module luyện thi và dữ liệu câu hỏi có thể dùng làm style examples.
- Tìm component quiz có thể tái sử dụng.
- Tìm Docker/deployment config hiện có.
- Kiểm tra project đã có Python/FastAPI/AI Service hay chưa.
- Tạo `AI_SERVICE_PROJECT_AUDIT.md`.
- Điền toàn bộ các mục `TBD_AFTER_GOAL_0_AUDIT` trong tài liệu.

### Gate

- Không còn mơ hồ về vị trí `ai-service`.
- Có danh sách file tích hợp cụ thể.
- Có lệnh build/test hiện tại.
- Có danh sách câu hỏi cần người dùng quyết định.

---

## Goal 1 — Onboard dữ liệu canonical vào project

### Mục tiêu

Đưa artifact bước 1–6 vào project có cấu trúc, version và kiểm tra rõ ràng.

### Công việc

- Đặt `sgk_chunks.jsonl`, reports và manifest vào thư mục dữ liệu đã chốt.
- Không commit embedding production nếu policy project không cho phép.
- Thêm script validate schema, hash, số chunk và review flags.
- Xác định policy đối với 45 chunk `containsPendingReview=true`:
  - loại khỏi production index; hoặc
  - cho phép index nhưng không dùng để sinh câu; hoặc
  - review và cập nhật source trước.
- Tạo corpus version và chunking version.

### Gate

- Validate đúng 459 chunk hoặc số lượng mới có giải thích.
- Không có duplicate ID/hash.
- Có report rõ ràng cho pending review.

---

## Goal 2 — Gemini embedding và ChromaDB index

### Mục tiêu

Tạo semantic embedding production và index có thể rebuild.

### Công việc

- Xác minh model embedding chính thức hiện hành từ tài liệu nhà cung cấp.
- Cấu hình qua environment variable, không hard-code.
- Batch embedding, retry, checkpoint và resume.
- Lưu embedding metadata: model, dimension, corpus version, created_at.
- Tạo collection mới, ví dụ `sgk_kntt_history_gemini_v1`.
- Upsert theo deterministic `chunkId`.
- Tạo script `index`, `rebuild`, `count`, `inspect`.
- Không trộn local baseline với Gemini vectors.

### Gate

- Số vector bằng số chunk được phép index.
- Kích thước vector nhất quán.
- Collection có thể rebuild idempotently.
- Có báo cáo index manifest.

---

## Goal 3 — Retrieval service và evaluation

### Mục tiêu

Tìm đúng chunk SGK trước khi gọi Gemini sinh câu hỏi.

### Công việc

- Tạo query embedding bằng cùng model/cấu hình với document embedding.
- Hỗ trợ filter theo `grade`, `lessonNumber`, `documentId`, `contentType`.
- Cấu hình `topK` có giới hạn.
- Tạo `POST /ai/retrieval/debug` chỉ cho dev/admin.
- Tạo Fact Context có chunk ID và nguồn.
- Tạo 30–50 retrieval test cases.
- Đo Top-1, Hit@3 hoặc Recall@k phù hợp.

### Gate

- Query chính xác và query dùng từ đồng nghĩa đều tìm được đúng bài/mục ở mức chấp nhận.
- Không lấy exercise/caption làm Fact Context.
- Có retrieval report tái lập được.

---

## Goal 4 — Gemini question generation và validation

### Mục tiêu

Sinh MCQ bốn lựa chọn có nguồn và kiểm tra được.

### Công việc

- Tạo Pydantic request/response schema.
- Prompt tách rõ `FACT_CONTEXT` và `STYLE_EXAMPLES`.
- Lấy 2–3 verified exam questions từ MySQL theo topic/difficulty.
- Bắt Gemini trả structured JSON.
- Validator:
  - đúng bốn options;
  - đúng một đáp án;
  - option IDs hợp lệ;
  - không trùng option;
  - sourceChunkIds tồn tại;
  - explanation không rỗng;
  - số câu đúng yêu cầu;
  - duplicate check với ngân hàng câu hỏi.
- Retry có giới hạn.
- Tạo `POST /ai/quiz/generate`.

### Gate

- Schema-valid rate đạt ngưỡng được chốt.
- Sinh thử ít nhất 30–50 câu và review thủ công.
- Không tự động ghi vào ngân hàng đề chính thức.

---

## Goal 5 — Tích hợp Spring Boot

### Mục tiêu

Spring Boot làm gateway nghiệp vụ cho AI Service.

### Công việc

- Tạo client gọi FastAPI.
- Reuse auth/error format hiện tại.
- Timeout, retry policy hợp lý và rate limit nếu cần.
- Không lộ API key cho frontend.
- Public endpoint dự kiến: `POST /api/quiz/generate`.
- Log request ID nhưng không log secret hoặc toàn bộ prompt nhạy cảm.

### Gate

- Integration test Spring → FastAPI thành công.
- Error mapping nhất quán với backend hiện tại.

---

## Goal 6 — Tích hợp frontend

### Mục tiêu

Cho người dùng chọn phạm vi và làm quiz AI.

### Công việc

- Tận dụng component quiz hiện có nếu phù hợp.
- Form chọn lớp, bài/chủ đề, số câu, độ khó.
- Loading, timeout, retry và error state.
- Hiển thị nguồn SGK sau khi trả lời.
- Gắn nhãn rõ câu hỏi do AI sinh.

### Gate

- Build/typecheck frontend pass.
- Demo end-to-end ổn định.

---

## Goal 7 — Đánh giá, luận văn và bàn giao

### Công việc

- Retrieval metrics.
- Schema validity.
- Groundedness và answer correctness.
- Single-correct-answer validity.
- Distractor quality.
- Duplicate rate.
- Latency, error rate và chi phí ước lượng.
- Cập nhật ảnh, sequence diagram và bảng kết quả trong luận văn.
- Viết limitations trung thực.

### Gate

- Có số liệu tái lập được.
- Tài liệu handoff đầy đủ.
- Không còn claim “100% chính xác” hoặc “không hallucination”.

## Goal 13A–13B — implemented scope

Granular role-derived authorities, teacher mapping, four-eyes approval, explicit self-review override audit, protected live provenance validation, validation records, fail-closed transitions, and receipt retention cleanup are implemented without changing prompt/model/retrieval/embedding behavior. Exact next action for Goal 13C: create a post-publish revision workflow with a new immutable revision/candidate, explicit source remapping, and a fresh review/provenance cycle; never mutate a published question in place.

## Goal 12 — Teacher/admin review, provenance, audit, explicit publish

Status: implemented. Gate: V35 staging schema, opaque user-bound receipt, lifecycle commands, admin authorization, provenance/audit, optimistic version checks, hidden-target atomic publish, idempotent repeat publish, admin queue/detail UI, tests, and documentation. Real multi-service E2E remains environment-dependent; no result is inferred when services are unavailable. Exact next action for Goal 13: add teacher/granular permissions, four-eyes policy, canonical source revalidation, and revision flow without weakening the no-auto-publish invariant.

## Goal 13C — immutable post-publish revision

Status: implemented locally, uncommitted. Gate includes V37, new revision candidate from the current published head, one-open lock, deterministic numbering, base snapshot conflict checks, internal canonical search, explicit remap, normal review lifecycle, new official row plus chain/head transaction, frontend comparison/actions, and automated tests. Goal 13D is the exact next phase: production-like MySQL migration and real two-user multi-service E2E in a non-public environment, followed by deployment planning only after evidence is captured.
