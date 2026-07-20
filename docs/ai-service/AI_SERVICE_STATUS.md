# AI Service RAG — Current Status

## Metadata phiên bản

- Ngày cập nhật gần nhất: 2026-07-20
- Repository dự kiến: `D:/KLTN/lich-su-viet-nam-3d`
- Nhánh đã được nhắc trước đây: `be_exams`
- Nhánh thực tế: `ai_service` (khác tên `ai-service` trong yêu cầu; không đổi branch)
- Commit đã xác minh: `99296ca31a953027dc91f4cd122cdd27b45a5ca9`
- Người cập nhật gần nhất: `Codex — Goal 7C/7D Production`

## Trạng thái tổng quát

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| HTML crawl gốc | DONE | 47 bài |
| HTML → Markdown sạch | DONE | Có bản extracted và clean |
| Chuẩn hóa văn bản | DONE_WITH_REVIEW | 33 sửa tự động, 18 mục cần review |
| Structured blocks | DONE | Có file JSONL gộp |
| Chunking | DONE | 459 chunk |
| Chunk audit | PASSED | Không rỗng, không trùng ID/hash, không quá 500 từ |
| Goal 7A — FastAPI foundation | DONE | Typed config, package layout, `GET /ai/health` |
| Goal 7B — Corpus onboarding/validation | DONE | Streaming loader, typed schema, CLI report, unit tests |
| Embedding local baseline | DONE | TF-IDF + Random Projection, 256 chiều |
| Goal 7C — Gemini embedding pipeline | DONE_PRODUCTION | 414/414 eligible vectors, dimension 768, zero unresolved failures |
| Gemini embedding production artifacts | COMPLETED | Manifest `COMPLETED`; 414 unique finite vectors; 45 pending excluded |
| Goal 7D — Chroma indexing | DONE_PRODUCTION | Dry-run, smoke 3, full 414, idempotency và persistence pass |
| ChromaDB production index | READY | `sgk_kntt_history_gemini_v1`, 414 unique IDs, cosine |
| Retrieval service | NOT_STARTED | Chưa có API production |
| Retrieval evaluation | PARTIAL | Mới có smoke test local |
| Gemini question generation | NOT_STARTED | Chưa có prompt/schema/validator production |
| Spring Boot integration | NOT_STARTED | Cần audit project |
| React integration | NOT_STARTED | Cần audit component quiz hiện có |
| Thesis evaluation | NOT_STARTED | Cần số liệu thực nghiệm |

## Artifact đầu vào đã có

### Gói bước 1–4

- `sgk_rag_steps_1_4_output.zip`
- 47 Markdown sạch.
- Structured blocks.
- Corpus manifest.
- Báo cáo sửa lỗi và review.

### Gói bước 5–6

- `sgk_rag_steps_5_6_output.zip`
- `chunks/sgk_chunks.jsonl`: nguồn chunk canonical.
- `chunks/sgk_chunks_compact.jsonl`: bản xem nhanh.
- `db_ready/chroma_records_local.jsonl`: record baseline.
- `scripts/build_gemini_embeddings.py`: script tham khảo.
- Báo cáo audit và smoke test.

## Số liệu đã xác minh

- 47 tài liệu: lớp 10 có 14, lớp 11 có 16, lớp 12 có 17.
- 126.899 từ.
- 118 bảng.
- 348 tham chiếu ảnh chưa có file ảnh.
- 459 chunk dùng được làm Fact Context.
- 45 chunk có `containsPendingReview=true`.
- Embedding local baseline: 459 vector × 256 chiều.

## Corpus validation thực tế

- Lệnh: `python -m scripts.validate_corpus`
- Kết quả: `PASSED`.
- Tổng record: 459 (tính từ file, không hard-code).
- Eligible (`containsPendingReview=false`): 414.
- Pending review (`containsPendingReview=true`): 45.
- Duplicate `chunkId`: 0.
- Invalid record/JSON: 0.
- 12 record có `pageStart` và `pageEnd` là `null`; typed model giữ nguyên giá trị này.
- Report runtime: `ai-service/data/corpus/runtime_validation_report.json`.

## Blocker và việc tiếp theo

- Không có blocker cho Goal 7A/7B.
- Tên branch thực tế là `ai_service`, không khớp `ai-service` trong yêu cầu.
- Model đã xác minh: `gemini-embedding-2`, dimension 768; SDK `google-genai==2.12.1`.
- Code Goal 7C đã hoàn thành: lazy provider, formatter, retry, batch mapping, checkpoint/resume, CLI và tests.
- Root cause HTTP 400: `GEMINI_API_KEY` chứa 12 key phân cách bằng dấu phẩy nhưng code cũ truyền nguyên chuỗi như một key. Sau khi parse pool, key position 1 trả 403 project denied; key position 2 pass. Không ghi giá trị key vào log/report.
- Goal 7C production hoàn tất: 414/414 eligible, 45 pending skipped, failure report rỗng, corpus SHA đúng.
- Goal 7D production hoàn tất: Chroma dry-run pass; smoke count 3; full và idempotent rerun count 414; reopen inspect giữ 414.
- Health trả `chromaReady=true` bằng file/report readiness check nhẹ; không mở collection hoặc load vectors.
- Exact next action cho Goal 8: xây retrieval debug/service và bộ evaluation trên collection đã khóa contract; chưa bắt đầu trong phiên production này.

## Nhật ký thực thi

### 2026-07-19 — Goal 7A/7B: FastAPI foundation và corpus validation

- Branch/commit: `ai_service` / `99296ca31a953027dc91f4cd122cdd27b45a5ca9`.
- Files changed: package `app/`, CLI `scripts/`, tests, config, dependency files, README và tài liệu AI Service.
- Commands run: Git audit commands, `python --version`, `python -m pip install -r requirements-dev.txt`, `python -m pytest`, `python -m scripts.validate_corpus`, Uvicorn health smoke test.
- Tests passed: 8/8; health smoke test trả HTTP 200 với response đúng contract.
- Tests failed: lần chạy đầu lỗi collection do dependency chưa cài; lần chạy tiếp theo có 1 test corpus fail do 12 page field là `null`; cả hai đã được xử lý và lần cuối pass.
- Decisions: package tách lớp; config chỉ từ environment; pending review được giữ nguyên và tách khỏi eligible; không khởi tạo Gemini/Chroma.
- Remaining issues: một deprecation warning từ `fastapi.testclient`/Starlette về `httpx`; không ảnh hưởng kết quả test.
- Exact next action: thực hiện bước chuẩn bị Goal 7C như mô tả ở trên.

### 2026-07-19 — Goal 7C: Gemini embedding provider và checkpoint pipeline

- Branch/commit: `ai_service` / `99296ca31a953027dc91f4cd122cdd27b45a5ca9`.
- Verified: `gemini-embedding-2`, dimension 768, Google Gen AI Python SDK 2.12.1; separate `types.Content` per document.
- Commands: dependency install, `python -m pytest`, corpus validator, embedding dry-runs, compileall, `git diff --check`, requirements encoding/diff checks.
- Tests: 32 passed, 1 integration skipped vì không có API key; 1 deprecation warning không liên quan embedding.
- Dry-run: 459 total, 414 eligible, 45 pending skipped, 414 selected, 0 vectors.
- Smoke test: không chạy; `GEMINI_API_KEY` absent.
- Production artifacts: không có; `storage/embeddings` absent.
- Blocker: cần key và phê duyệt smoke test trước full run.
- Exact next action: smoke tối đa ba chunk, review output, rồi xin duyệt full run trước Goal 7D.

### 2026-07-19 — Goal 7D: persistent ChromaDB index

- Chroma: `chromadb==1.5.9`, Python 3.10 compatible; `PersistentClient`, cosine distance, explicit precomputed embeddings.
- Code: strict artifact gate, flattened metadata, collection compatibility check, idempotent batch upsert, recreate guard, build/inspect CLI and atomic report.
- Tests: 51 passed, 1 Gemini integration skipped; temporary persistence reopen and idempotent second run passed.
- Production artifact validation: FAILED — missing records file, incomplete/error manifest, 3 unresolved failures, 414 missing embeddings.
- Chroma dry-run: FAILED as designed, exit 2; no production client/collection/report created.
- Smoke/full index: not run because artifact gate failed.
- Production collection count: unavailable; collection does not exist.
- Blocker: repair and complete Goal 7C production artifacts.
- Exact next action: rebuild/validate all 414 embeddings, then rerun Chroma dry-run and gated index sequence before Goal 8.

### 2026-07-20 — Goal 7C Repair: Gemini HTTP 400 và key pool

- Root cause: 12 API key bị nối bằng dấu phẩy và SDK nhận toàn bộ chuỗi như một credential, gây HTTP 400 `API_KEY_INVALID`. Sau khi tách pool, key đầu trả 403 `PERMISSION_DENIED` do project; key thứ hai hoạt động.
- Code repair: client khóa rõ `vertexai=False`; request builder chặn Content rỗng/quá dài; một `Content` trên mỗi document; failure giữ exception class, code, status, message/details đã sanitize, model/dimension, batch size/chunk IDs và stage.
- Key pool: trim/bỏ entry rỗng và trùng; failover chỉ với `API_KEY_INVALID` hoặc 401/403 credential/project; lỗi 400 content/schema vẫn permanent, 429/5xx vẫn retry như trước. Key hợp lệ được giữ cho các batch sau trong process.
- Diagnostic: `plain`, `single-content`, `multi-content`, `corpus --limit 1` đều PASSED; multi trả đúng 3 vector × 768.
- Smoke 1: selected/newly `1/1`, 0 failure, `COMPLETED`. Smoke 3: selected/newly `3/3`, 3 unique records × 768, 0 failure, `COMPLETED`. Resume: already/newly `3/0`.
- Verification cuối: 69 passed, 1 skipped; corpus validation, embedding dry-run, compileall, artifact secret-field scan và `git diff --check` pass. `ruff`/`mypy` không có trong environment.
- Production Chroma không được tạo hoặc sửa; full 414 embeddings không chạy.
- Exact next action: review smoke artifact; cần user approval riêng trước full 414, sau đó mới chạy Chroma dry-run/gates.

### 2026-07-20 — Goal 7C/7D production completion

- Initial artifact: 99 successful, 8 failure rows, 307 unattempted. Cả tám row là cùng một batch 8 chunk, HTTP 429 `RESOURCE_EXHAUSTED`, free-tier request quota; phân loại quota/rate-limit.
- Stop cause: retry-exhausted 429 bị wrap thành `PermanentEmbeddingError`; service `break` theo exception class nên dừng sau 107 attempted và gắn sai `COMPLETED_WITH_ERRORS` dù còn 307 unattempted.
- Durability repair: retry/failover scope tách khỏi run-fatal scope; exhausted 429 được ghi unresolved rồi tiếp tục batch sau; non-credential request error được bisect hữu hạn tới chunk; resolved failures bị rewrite khỏi report; resume chỉ dựa valid record identity.
- Manifest contract: thêm `successfulRecords`, `attemptedRecords`, `unattemptedRecords`, `remainingRecords`, `unresolvedFailedRecords`; status mới `IN_PROGRESS`, `PARTIAL`, `PARTIAL_WITH_ERRORS`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`.
- Offline gates: 77 pass, 1 skip trước production. Final suite sau health update: 78 pass, 1 skip; corpus validation/dry-run/compileall/diff check và artifact secret scan pass.
- Diagnostics: plain và canonical corpus pass, key pool 12 entries; không log key. 429/5xx/network không chuyển key.
- Resume pass 1: already 99, newly 291, successful 390, unresolved/remaining 24, unattempted 0, `COMPLETED_WITH_ERRORS`.
- Resume pass 2: already 390, newly 24, successful 414, unresolved/unattempted/remaining 0, `COMPLETED`. Không cần pass 3. Tổng production vectors thành công mới trong phiên: 315; artifact cuối: 414.
- Artifact validation: 414 records/unique IDs, dimension 768, zero duplicate/NaN/Infinity/missing/extra/hash mismatch/pending-review, SHA `a4bd330be7b4b43ac9da25966877fef51c66c0e14cc68baa7eccf46a63e15ab2`.
- Chroma: dry-run 414 pass; smoke 3 pass; full count 414; rerun before/after 414/414; separate-process reopen inspect 414; 414 unique IDs, vectors 768, cosine, zero non-finite.
- Health: HTTP 200, `chromaReady=true`; readiness chỉ đọc SQLite marker và completed index report.
- Exact next action: Goal 8 retrieval debug/service và retrieval evaluation; không bắt đầu retrieval/generation/integration trong phiên này.

### 2026-07-20 — Goal 8 retrieval service và evaluation baseline

- Trạng thái `DONE_PRODUCTION`; `POST /ai/retrieval/debug` và `retrievalReady=true` đã smoke thành công.
- Artifact giữ nguyên: corpus SHA `a4bd330be7b4b43ac9da25966877fef51c66c0e14cc68baa7eccf46a63e15ab2`; manifest `COMPLETED` 414; collection cosine/768 có 414 unique ID, không pending-review.
- Benchmark engineering: 36 query, mỗi lớp 10/11/12 có 12, đủ 9 category, expected chunk có source evidence.
- Baseline: strict chunk Hit@1 `0.888889`, Hit@3/5 `1.0`, document/lesson Hit@1/3/5 `1.0`, MRR `0.944444`.
- Invariant: filter compliance `1.0`; pending leakage, duplicate, empty result đều `0.0`; dimension/metadata mismatch đều `0`.
- Pass đầu 36 cache miss, 0 lỗi/quota incident. Resume: 36 cache hit, 0 embedding call mới; average/P50/P95 `264.75/265.5/344.0 ms`.
- Smoke 6/6 loại query pass. Grade+lesson bài 10 trả 3/5 vì collection chỉ có 3 chunk đúng filter. Full suite `98 passed, 2 skipped`.
- Hạn chế: benchmark chưa expert validation; bốn query không hit expected chunk ở rank 1 nhưng đều hit top 3; raw distance không phải confidence.
- Blocker: không có.
- Exact next action Goal 9: review bốn rank-1 miss, khóa generation contract/validation chỉ dùng Fact Context có truy nguồn; chưa persist vào ngân hàng đề.

## Kế hoạch dài hạn tham chiếu

1. Chạy Goal 0: audit project hiện tại bằng Codex.
2. Chốt vị trí module `ai-service`, cách chạy local và deployment.
3. Đưa artifact canonical vào project theo cấu trúc đã chốt.
4. Quyết định cách xử lý 18 mục review và 45 chunk bị ảnh hưởng.
5. Tạo Gemini embeddings production và collection ChromaDB mới.
6. Xây retrieval debug API và bộ test retrieval.

Các phiên sau tiếp tục thêm nhật ký theo mẫu:

```text
### YYYY-MM-DD — <goal/task>
- Branch/commit:
- Files changed:
- Commands run:
- Tests passed:
- Tests failed:
- Decisions:
- Remaining issues:
- Exact next action:
```
