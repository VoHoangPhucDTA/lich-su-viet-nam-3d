# AI Service RAG — Data Contract

## 1. Nguồn canonical

Nguồn chính cho indexing là:

```text
ai-service/data/corpus/sgk_chunks.jsonl
```

Không dùng trực tiếp HTML hoặc Markdown trong runtime retrieval. HTML/Markdown dùng để audit, sửa và rebuild chunk khi cần.

## 2. Chunk schema dự kiến

```json
{
  "chunkId": "kntt-ls12-bai06-12952-c0004-...",
  "documentId": "kntt-ls12-bai06-12952",
  "grade": 12,
  "lessonNumber": 6,
  "lessonTitle": "CÁCH MẠNG THÁNG TÁM NĂM 1945",
  "sectionTitle": "Nguyên nhân thắng lợi",
  "sectionPath": ["Nguyên nhân thắng lợi"],
  "pageStart": 35,
  "pageEnd": 35,
  "contentTypes": ["knowledge"],
  "text": "...",
  "embeddingText": "Lịch sử lớp 12 — Bài 6 ...",
  "sourceFile": "...",
  "sourceBlockIds": ["..."],
  "containsPendingReview": false,
  "sourceHash": "...",
  "chunkHash": "...",
  "chunkingVersion": "structure-v2"
}
```

Goal 0/1 phải xác minh tên trường thực tế trong artifact trước khi viết parser production.

## 3. Trường bắt buộc khi index

- `chunkId`
- `documentId`
- `grade`
- `lessonTitle`
- `contentTypes`
- `text`
- `embeddingText`
- `chunkHash`
- `chunkingVersion`
- `containsPendingReview`

## 4. Policy pending review

Hiện có 45 chunk bị ảnh hưởng bởi 18 mục cần đối chiếu.

Trước production phải chọn một policy:

### Policy A — Exclude

Không index các chunk `containsPendingReview=true`.

### Policy B — Index but block generation

Cho phép retrieval debug nhưng không cho dùng làm Fact Context khi sinh câu.

### Policy C — Review then publish

Đối chiếu bản in, cập nhật Markdown/chunk và rebuild corpus.

Khuyến nghị ban đầu: **Policy B trong dev, Policy C trước demo chính thức**.

## 5. Embedding record — Goal 7C

```json
{
  "chunkId": "...",
  "chunkHash": "...",
  "documentId": "...",
  "embeddingModel": "gemini-embedding-2",
  "dimension": 768,
  "formatterVersion": "gemini-retrieval-document-v1",
  "vector": [0.01, -0.03],
  "createdAt": "ISO-8601 UTC"
}
```

Resume key bắt buộc gồm `chunkId`, `chunkHash`, `embeddingModel`, `dimension`, `formatterVersion`.

## 6. Embedding manifest

```json
{
  "corpusSha256": "...",
  "embeddingModel": "gemini-embedding-2",
  "dimension": 768,
  "formatterVersion": "gemini-retrieval-document-v1",
  "totalCorpusRecords": 459,
  "eligibleRecords": 414,
  "pendingReviewSkipped": 45,
  "selectedRecords": 414,
  "alreadyCompleted": 0,
  "newlyEmbedded": 0,
  "successfulRecords": 414,
  "attemptedRecords": 414,
  "unattemptedRecords": 0,
  "remainingRecords": 0,
  "unresolvedFailedRecords": 0,
  "failedRecords": 0,
  "truncatedTailRecovered": false,
  "dryRun": false,
  "status": "COMPLETED",
  "updatedAt": "ISO-8601 UTC"
}
```

Các count được tính runtime, không hard-code. `failedRecords` là compatibility alias của `unresolvedFailedRecords`.

- `successfulRecords`: selected chunks có valid resume identity record.
- `attemptedRecords`: union của successful và unresolved failure chunk IDs.
- `unattemptedRecords = selectedRecords - attemptedRecords`.
- `remainingRecords = selectedRecords - successfulRecords`.
- `unresolvedFailedRecords`: current failure IDs chưa có valid record thay thế.

Status có thể là `DRY_RUN`, `IN_PROGRESS`, `PARTIAL`, `PARTIAL_WITH_ERRORS`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`. Chỉ `COMPLETED` với `successfulRecords=selectedRecords` và zero remaining/unresolved mới qua production artifact gate.

## 7. Failure record

Failure file dùng cùng identity fields và context chẩn đoán đã sanitize:

```json
{
  "chunkId": "...",
  "chunkHash": "...",
  "documentId": "...",
  "embeddingModel": "gemini-embedding-2",
  "dimension": 768,
  "formatterVersion": "gemini-retrieval-document-v1",
  "errorType": "PermanentEmbeddingError",
  "message": "API key not valid. Please pass a valid API key.",
  "exceptionClass": "ClientError",
  "httpCode": 400,
  "providerStatus": "INVALID_ARGUMENT",
  "providerDetails": {"error": {"status": "INVALID_ARGUMENT"}},
  "requestStage": "embed_content",
  "batchSize": 3,
  "batchChunkIds": ["chunk-a", "chunk-b", "chunk-c"],
  "createdAt": "ISO-8601 UTC"
}
```

`providerDetails` giữ cấu trúc SDK khi có nhưng phải redact secret-bearing keys/values. Record tuyệt đối không chứa API key, Authorization header, `.env` hoặc toàn bộ document text. Failure record không phải completion record và không được dùng làm resume key; `--force`/resume phải chỉ công nhận `EmbeddingRecord` hợp lệ.

Nếu `GEMINI_API_KEY` là key pool phân cách bằng dấu phẩy, artifact không lưu key, key count hay selected key position. Các thông tin position chỉ thuộc diagnostic runtime; embedding identity vẫn chỉ phụ thuộc model/dimension/formatter/corpus contract.

## 8. Chroma record

```json
{
  "id": "<chunkId>",
  "document": "<text>",
  "embedding": [0.01, -0.03],
  "metadata": {
    "document_id": "...",
    "grade": 12,
    "lesson_number": 6,
    "lesson_title": "...",
    "section_title": "...",
    "content_type": "knowledge",
    "page_start": 35,
    "page_end": 35,
    "pending_review": false,
    "chunk_hash": "...",
    "corpus_version": "sgk-kntt-v1"
  }
}
```

Metadata phải dùng primitive values tương thích với Chroma. Array như `sectionPath` có thể serialize thành chuỗi nếu Chroma version đang dùng không hỗ trợ trực tiếp.

Contract Goal 7D:

- `id`: `chunkId`.
- `document`: canonical `chunk.text`, không biến đổi.
- `embedding`: production `EmbeddingRecord.vector` 768 chiều.
- `sectionPath`: join bằng `" > "`, giữ thứ tự hierarchy.
- `contentTypes`: sort rồi join bằng `"|"`.
- `pageStart/pageEnd`: bỏ field khi canonical value là `null`.
- Metadata còn lại: `documentId`, `grade`, `lessonNumber`, `lessonTitle`, `sectionTitle`, `containsPendingReview`, `chunkHash`, `chunkingVersion`, `embeddingModel`, `embeddingDimension`, `formatterVersion`.

## 9. Chroma collection contract

```json
{
  "corpusSha256": "...",
  "embeddingModel": "gemini-embedding-2",
  "embeddingDimension": 768,
  "formatterVersion": "gemini-retrieval-document-v1",
  "chunkingVersion": "structure-v2",
  "distanceMetric": "cosine",
  "sourceType": "sgk-kntt-history"
}
```

HNSW configuration phải có `space=cosine`. Existing collection có bất kỳ field contract không tương thích đều bị từ chối trước upsert.

## 10. Chroma index report

```json
{
  "collectionName": "sgk_kntt_history_gemini_v1",
  "persistDirectory": ".../storage/chroma",
  "embeddingModel": "gemini-embedding-2",
  "dimension": 768,
  "inputRecords": 414,
  "insertedOrUpdated": 414,
  "collectionCountBefore": 0,
  "collectionCountAfter": 414,
  "duplicateIds": [],
  "dryRun": false,
  "status": "COMPLETED",
  "createdAt": "ISO-8601 UTC"
}
```

Report không chứa vectors. Report production chỉ được ghi sau khi artifact gate pass và index operation hoàn tất.

## 11. Fact Context

Fact Context được tạo trong runtime, không lưu như nguồn canonical.

```text
[CHUNK_ID: ...]
[SOURCE: Lịch sử lớp 12 — Bài 6 — Nguyên nhân thắng lợi — trang 35]
<Nội dung chunk>
```

Mỗi câu trả về phải tham chiếu ít nhất một `sourceChunkId` tồn tại trong tập chunk được đưa vào prompt.

## 12. Style Example

```json
{
  "questionId": "...",
  "question": "...",
  "options": [
    {"id": "A", "text": "..."},
    {"id": "B", "text": "..."},
    {"id": "C", "text": "..."},
    {"id": "D", "text": "..."}
  ],
  "correctOptionId": "B",
  "difficulty": "MEDIUM",
  "cognitiveLevel": "UNDERSTANDING",
  "topicIds": ["..."]
}
```

Chỉ lấy câu đã được project hiện tại xem là verified/public theo đúng field thực tế sau Goal 0 audit.

## 13. Versioning và idempotency

- `chunkId` phải deterministic.
- `chunkHash` dùng để tránh re-embed chunk không đổi.
- Mọi index build có manifest chứa model, dimension, corpus version và count.

## 14. Retrieval, Fact Context và benchmark — Goal 8

`RetrievalResult` giữ rank, chunk/document identity, grade/lesson, title/path/page nullable, content types, nguyên văn `text`, raw `distance` và `chunkHash`. API không trả vector hoặc confidence.

```json
{
  "text": "[SOURCE 1]\nchunkId: ...",
  "sourceChunkIds": ["..."],
  "includedChunks": 1,
  "truncated": false,
  "characterCount": 500
}
```

Fact Context theo đúng thứ tự result, chỉ dùng eligible final results, tối đa 5 chunk/12.000 ký tự; có thể cắt ở ranh giới câu. Page thiếu là `unknown` trong context và `null` trong API.

Benchmark JSONL `data/evaluation/retrieval_benchmark.jsonl` gồm query identity/content/category, grade/lesson, typed filters, expected chunk/document/section keywords và `sourceEvidence`. Expected ID phải thuộc canonical eligible corpus. Đây là engineering baseline, không phải expert-labelled dataset.

Cache chỉ chứa vector dưới identity không đảo ngược dựa trên query hash + model + dimension + query formatter. Cache/report runtime bị Git ignore; report/API không chứa vector, API key hoặc authorization header.
- Không upsert vector khác dimension vào collection cũ.

## 15. Grounded generation — Goal 9

Structured output dùng `GeneratedQuestionBatch` với danh sách câu hỏi strict; unknown fields bị từ chối. Mỗi `GeneratedQuestion` có `question`, đúng bốn `options` A–D, `correctOptionId`, `explanation`, `difficulty` và ít nhất một `sourceChunkId`. Source ID bắt buộc thuộc tập Fact Context của đúng request.

Style fixture tại `tests/fixtures/style_examples.json` là dữ liệu synthetic/sanitized để test và benchmark, không phải nguồn fact và không đại diện dữ liệu verified trong MySQL. Production integration sau này chỉ truyền tối đa 2–3 câu đã verified qua Spring Boot.

Benchmark JSONL `data/evaluation/generation_benchmark.jsonl` có 12 case: bốn case cho mỗi lớp 10/11/12, bốn case cho mỗi difficulty, bốn case có style fixture và một case context hẹp. Document ID phải tồn tại trong eligible corpus.

Generation evaluation cache identity gồm hash request, ordered source IDs/chunk hashes, generation model, temperature, prompt version, schema version và style hash. Cache/report nằm dưới `storage/`, atomic và Git-ignored; không chứa API key, prompt đầy đủ, vector hay raw provider response. Source thay đổi hoặc đổi bất kỳ semantic identity field nào đều cache miss.

Report gồm request/parse/schema/source/option/explanation rates, duplicate rates, heuristic warning rates, repair/partial/insufficient rates, latency, cache hits/misses, errors và danh sách câu cần manual review. `properNameEvidenceWarningRate` và `dateEvidenceWarningRate` là review signal; report không được diễn giải chúng như correctness score.

## Candidate provenance contract

The server retains request ID/query/filter/count, generation and embedding model, embedding dimension, prompt/schema version, corpus SHA, collection, validation/generation warnings, and immutable source metadata including optional chunk hash. It stores original and editable question/option snapshots separately. It never stores Gemini keys, JWTs, Authorization headers, vectors, raw prompts, or full textbook chunks. Provenance describes lineage and review history; it is not proof of factual correctness.
