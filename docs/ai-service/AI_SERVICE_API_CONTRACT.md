# AI Service RAG — API Contract

> Goal 13D verified public Spring contracts through HttpOnly-cookie auth and fixed internal provenance routes through a separate service token. Concurrent publish losers return the committed reference or a safe conflict without duplication.

FastAPI contract đã triển khai cho health, retrieval debug và grounded generation. Naming/auth/error public của Spring Boot vẫn phải được map theo backend hiện tại ở Goal 10.

## 1. FastAPI internal endpoints

### `GET /ai/health`

Response dự kiến:

```json
{
  "status": "UP",
  "service": "ai-service",
  "corpusVersion": "sgk-kntt-v1",
  "collection": "sgk_kntt_history_gemini_v1",
  "indexedChunks": 459
}
```

Không trả secret hoặc API key.

### `POST /ai/retrieval/debug`

Endpoint nội bộ cho development/evaluation; không lưu request và không gọi generation model.

Request:

```json
{
  "query": "Nguyên nhân thắng lợi của Cách mạng tháng Tám",
  "grade": 12,
  "lessonNumber": 6,
  "documentId": null,
  "topK": 5
}
```

Response:

```json
{
  "query": "...",
  "filters": {"grade": 12, "lessonNumber": 6, "documentId": null},
  "topK": 5,
  "candidateCount": 15,
  "resultCount": 5,
  "results": [
    {
      "rank": 1,
      "chunkId": "...",
      "documentId": "...",
      "grade": 12,
      "lessonNumber": 6,
      "lessonTitle": "...",
      "sectionTitle": "...",
      "sectionPath": "...",
      "pageStart": 34,
      "pageEnd": 35,
      "contentTypes": "knowledge",
      "text": "...",
      "distance": 0.0,
      "chunkHash": "..."
    }
  ],
  "factContext": {
    "text": "[SOURCE 1]...",
    "sourceChunkIds": ["..."],
    "includedChunks": 5,
    "truncated": false,
    "characterCount": 1000
  },
  "metadata": {
    "embeddingModel": "gemini-embedding-2",
    "embeddingDimension": 768,
    "queryFormatterVersion": "gemini-retrieval-query-v1",
    "collectionName": "sgk_kntt_history_gemini_v1",
    "distanceMetric": "cosine"
  }
}
```

Validation: query bắt buộc, trim, tối đa 1000 ký tự; grade chỉ 10/11/12; `lessonNumber > 0`; `documentId` không rỗng; `topK` mặc định 5 và trong 1..10. Client không truyền raw Chroma `where` hoặc bật pending-review.

Errors: `422` request/topK/filter sai; `503` collection/manifest chưa sẵn sàng hoặc embedding tạm lỗi; `500` lỗi không dự kiến. Không trả key, vector hoặc stack trace. `distance` là raw distance, không phải confidence/probability.

### `POST /ai/quiz/generate`

Endpoint nội bộ đã triển khai. Endpoint không lưu request/câu hỏi, không nhận raw prompt/model, không truy cập MySQL và không trả prompt, API key, vector hay raw provider response.

Request:

```json
{
  "query": "Nguyên nhân thắng lợi của Cách mạng tháng Tám",
  "grade": 12,
  "lessonNumber": 6,
  "documentId": null,
  "count": 5,
  "difficulty": "MEDIUM",
  "topK": 5,
  "styleExamples": []
}
```

Response:

```json
{
  "questions": [
    {
      "question": "...",
      "options": [
        {"id": "A", "text": "..."},
        {"id": "B", "text": "..."},
        {"id": "C", "text": "..."},
        {"id": "D", "text": "..."}
      ],
      "correctOptionId": "B",
      "explanation": "...",
      "difficulty": "MEDIUM",
      "sourceChunkIds": ["..."]
    }
  ],
  "sources": [
    {
      "chunkId": "...",
      "documentId": "...",
      "grade": 12,
      "lessonNumber": 6,
      "lessonTitle": "...",
      "sectionTitle": "...",
      "pageStart": 35,
      "pageEnd": 35
    }
  ],
  "metadata": {
    "requestedCount": 5,
    "generatedCount": 5,
    "retrievedChunkCount": 5,
    "generationModel": "gemini-2.5-flash",
    "embeddingModel": "gemini-embedding-2",
    "collectionName": "sgk_kntt_history_gemini_v1",
    "promptVersion": "grounded-mcq-v1",
    "schemaVersion": "grounded-mcq-schema-v1",
    "repairAttempts": 0,
    "latencyMs": 12000.0
  },
  "warnings": []
}
```

Validation request: `query` bắt buộc; grade chỉ 10/11/12; lesson dương; difficulty EASY/MEDIUM/HARD; count mặc định 5, tối đa 10; topK theo retrieval 1..10; tối đa 3 Style Examples. Mỗi Style Example phải có đúng A–D, một đáp án và lời giải.

Validation output: đúng bốn option A–D, một đáp án hợp lệ, text/lời giải không rỗng và trong giới hạn, difficulty khớp, source ID không trùng và là subset của Fact Context, không duplicate trong batch hoặc với style fixture. Date/proper-name checks là warning để review, không tự động chứng minh factuality.

Partial policy: sau tối đa một repair, nếu còn ít nhất một câu hợp lệ thì trả các câu đó cùng warning `INSUFFICIENT_VALID_QUESTIONS`; nếu không có câu hợp lệ thì request thất bại. `questions` không bao giờ được tự động persist.

HTTP errors hiện tại:

- `422`: request/constraint sai.
- `409`: không đủ Fact Context (`INSUFFICIENT_CONTEXT`).
- `503`: retrieval/generation chưa cấu hình hoặc provider tạm thời unavailable.
- `502`: provider output invalid/permanent/safety failure; không lộ raw provider response.
- `500`: lỗi không dự kiến với message an toàn.

### `POST /ai/index/rebuild`

Internal/admin only. Không public qua frontend.

Yêu cầu auth/policy phải chốt sau Goal 0.

## 2. Spring Boot public endpoint

### Practice flow: `POST /api/quiz/generate`

Đây là endpoint authenticated dành cho tự học trên `/quiz`; endpoint không tạo candidate và không ghi generation receipt.

Request:

```json
{"query":"Cách mạng tháng Tám năm 1945","difficulty":"MEDIUM","count":5}
```

Spring tự đặt `topK=5`, `grade=null`, `lessonNumber=null`, `documentId=null` khi gọi FastAPI để retrieval trên toàn bộ SGK lớp 10–12. Response `data` gồm `questions`, `sources`, `warnings`, `generation` và không có `generationReceipt`. Partial (`generatedCount > 0`) trả HTTP 200; zero question map thành `AI_INSUFFICIENT_CONTEXT`.

Endpoint legacy `/api/exams/ai/generate` bên dưới vẫn giữ request có grade/topK và receipt contract để tương thích candidate/review workflow.

Đã triển khai:

```http
POST /api/exams/ai/generate
```

Endpoint yêu cầu authenticated user (student/teacher/admin đều được theo policy `anyRequest().authenticated()` và matcher tường minh). Frontend không gửi `styleExamples`.

Request:

```json
{
  "query": "Nguyên nhân thắng lợi của Cách mạng tháng Tám năm 1945",
  "grade": 12,
  "lessonNumber": 6,
  "documentId": null,
  "difficulty": "MEDIUM",
  "count": 5,
  "topK": 5
}
```

Response dùng wrapper chung:

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "Success",
  "data": {
    "questions": [],
    "sources": [],
    "warnings": [],
    "generation": {
      "requestedCount": 5,
      "generatedCount": 5,
      "partial": false
    }
  },
  "timestamp": "ISO-8601"
}
```

Validation public: query nonblank/tối đa 1000; grade 10/11/12; lesson dương; difficulty EASY/MEDIUM/HARD; count/topK 1..10; documentId nếu có phải nonblank/tối đa 255. Unknown/raw Fact Context/source/model/key/filter fields không nằm trong DTO.

Spring Boot chịu trách nhiệm:

- Xác thực user.
- Validate count/grade/difficulty.
- Timeout và error mapping.
- Không trả internal debug data nếu không cần.
- Không để frontend biết địa chỉ hoặc key của Gemini.

DTO mapping:

```text
AiQuizGenerateRequest
+ tối đa 3 AiStyleExample được Spring đọc từ verified bank
→ AiQuizGenerationRequest
→ FastAPI GenerationRequest

FastAPI GenerationResponse
→ AiQuizGenerationResponse (internal, đầy đủ metadata)
→ AiQuizGenerateResponse (public, bỏ model/collection/prompt/schema/latency)
```

Partial: `generatedCount > 0` và nhỏ hơn `requestedCount` vẫn HTTP 200, `partial=true`, giữ warning và không gọi bù. Zero question không được trả như success.

Warning: giữ chuỗi warning của FastAPI; warning heuristic chỉ là manual-review signal, không mang nghĩa factual error.

### Frontend contract — `/quiz` practice

Frontend gọi duy nhất `POST /api/quiz/generate` qua API client chung (`credentials: include`). Body UI gồm `query`, `difficulty`, `count`; Spring tự thêm `grade=null`, `lessonNumber=null`, `documentId=null`, `topK=5`. Frontend không gửi `styleExamples`, Fact Context, source ID, model, key hoặc internal filter. `/api/exams/ai/generate` chỉ còn là compatibility contract cho candidate workflow.

Response `data` được parse phòng thủ: questions/sources/warnings/generation bắt buộc; bốn option phải theo A–D, correct ID phải tồn tại, source ID phải map được, count/partial phải nhất quán và nullable source page phải an toàn. Mismatch được normalize thành `AI_SERVICE_INVALID_RESPONSE`, không tự sửa đáp án.

Partial hợp lệ vẫn vào quiz với thông báo `generatedCount/requestedCount`, không retry. Error code public được map sang tiếng Việt thân thiện; raw Spring/FastAPI/Gemini detail không render. Warnings không được hiển thị như factual error cho học sinh.

## 3. Error contract draft

```json
{
  "code": "AI_RETRIEVAL_FAILED",
  "message": "Không thể lấy ngữ cảnh phù hợp.",
  "requestId": "...",
  "details": null
}
```

Các code dự kiến:

- `AI_SERVICE_UNAVAILABLE`
- `AI_INVALID_REQUEST`
- `AI_INDEX_NOT_READY`
- `AI_RETRIEVAL_FAILED`
- `AI_GENERATION_FAILED`
- `AI_OUTPUT_INVALID`
- `AI_RATE_LIMITED`
- `AI_TIMEOUT`

Error code Spring Goal 10 thực tế:

| Nguồn | HTTP Spring | Code |
|---|---:|---|
| Public DTO invalid | 400 | `VALIDATION_ERROR` |
| AI integration disabled | 503 | `AI_SERVICE_DISABLED` |
| FastAPI 409 `INSUFFICIENT_CONTEXT` | 409 | `AI_INSUFFICIENT_CONTEXT` |
| FastAPI 422 | 422 | `AI_SERVICE_CONTRACT_REJECTED` |
| FastAPI 502 | 502 | `AI_GENERATION_FAILED` |
| FastAPI 503/connection refused | 503 | `AI_SERVICE_UNAVAILABLE` |
| Timeout | 504 | `AI_SERVICE_TIMEOUT` |
| Malformed/inconsistent response | 502 | `AI_SERVICE_INVALID_RESPONSE` |
| Style bank unavailable | 503 | `AI_STYLE_EXAMPLES_UNAVAILABLE` |

Không trả raw FastAPI/Gemini body hoặc stack trace.

Goal 0 phải map theo error schema hiện có của backend.

## 4. Validation rules

- `count`: giới hạn nhỏ trong MVP, giá trị cụ thể chốt sau audit.
- `grade`: 10, 11 hoặc 12.
- `difficulty`: enum của project hiện tại.
- `topK`: giới hạn server-side.
- Không cho client truyền raw prompt.
- Không cho client chỉ định model tùy ý.

## Goal 13 authorization and internal provenance API

Candidate routes require matching `AI_CANDIDATE_*` authority; review and publish are distinct. Approve accepts `selfReviewOverride` and `overrideReason`; only the admin creator may use it and a nonblank reason is mandatory. Normal approval requires a different actor.

Protected `POST /ai/provenance/validate` accepts corpus SHA, collection, embedding model/dimension and chunk ID/hash pairs using `X-Internal-Service-Token`. It returns identity flags and sanitized codes only—never text, paths, vectors or secrets. Transition errors distinguish missing, changed, pending/not-eligible, stale, unavailable, timeout, and invalid provenance.

## Goal 12 review API

Compatibility generation responses include `generationReceipt: { id, expiresAt }`. Candidate creation sends only this opaque receipt ID and selected question indexes; model/source/corpus fields are server controlled. Authenticated candidate routes provide list/detail/update, submit, approve, reject, publish, audit, and publish-target discovery under `/api/exams/ai/candidates`. Teacher has create/view/edit/submit/review/audit authority; publish is admin-only, and every route is also guarded in the service layer. Every mutation uses a specific command; update/publish include `version`, reject requires `reason`, and publish requires dataset/definition/section IDs. Error codes include `AI_CANDIDATE_NOT_FOUND`, `AI_CANDIDATE_INVALID_STATUS`, `AI_CANDIDATE_INVALID_CONTENT`, `AI_CANDIDATE_VERSION_CONFLICT`, `AI_CANDIDATE_FORBIDDEN`, `AI_CANDIDATE_PROVENANCE_INVALID`, `AI_CANDIDATE_PUBLISH_FAILED`, and `AI_CANDIDATE_TARGET_INVALID`.

## Goal 13C revision API

- `POST /api/exams/ai/candidates/{publishedId}/revisions` with `{reason}` creates a new draft.
- `POST /api/exams/ai/candidates/{revisionId}/source-search` with query/optional grade/lesson/topK returns bounded canonical metadata.
- `PUT /api/exams/ai/candidates/{revisionId}/sources` with `{version,sources:[{chunkId,chunkHash}],reason}` explicitly remaps after live validation.
- Internal Spring-to-FastAPI `POST /ai/provenance/sources/search` uses `X-Internal-Service-Token`; browsers never call it.

Conflict codes add `AI_REVISION_ALREADY_OPEN`, `AI_REVISION_REQUIRED`, `AI_REVISION_INVALID_PARENT`, `AI_REVISION_BASE_CHANGED`, and `AI_REVISION_HEAD_CONFLICT`. Revision detail includes identity/base snapshot and open-candidate reference, never vectors, secrets, raw prompts, filesystem paths, or full chunks.
