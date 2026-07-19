# AI Service RAG — Runbook

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
GEMINI_GENERATION_MODEL=
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
LOG_LEVEL=INFO
```

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
- [ ] Index count đúng.
- [ ] Retrieval test pass ngưỡng.
- [ ] Không dùng pending-review chunks ngoài policy.
- [ ] Gemini structured output pass.
- [ ] Không có API key trong git diff/log.
- [ ] Spring integration test pass.
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
