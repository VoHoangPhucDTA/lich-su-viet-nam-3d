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
GEMINI_GENERATION_MODEL=gemini-2.5-flash
GEMINI_GENERATION_TEMPERATURE=0.3
GEMINI_GENERATION_MAX_OUTPUT_TOKENS=8192
GEMINI_GENERATION_MAX_RETRIES=3
GEMINI_GENERATION_REPAIR_ATTEMPTS=1
GEMINI_GENERATION_TIMEOUT_SECONDS=60
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
