# AI Service RAG — API Contract Draft

Tài liệu này là draft. Goal 0 phải điều chỉnh naming, auth và error format theo project hiện tại.

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

Dev/admin only.

Request:

```json
{
  "query": "Nguyên nhân thắng lợi của Cách mạng tháng Tám",
  "grade": 12,
  "lessonNumber": 6,
  "documentId": null,
  "topK": 5,
  "includePendingReview": false
}
```

Response:

```json
{
  "query": "...",
  "filters": {"grade": 12},
  "results": [
    {
      "rank": 1,
      "chunkId": "...",
      "documentId": "...",
      "lessonTitle": "...",
      "sectionTitle": "...",
      "text": "...",
      "distance": 0.0,
      "pendingReview": false
    }
  ]
}
```

### `POST /ai/quiz/generate`

Request:

```json
{
  "grade": 12,
  "topic": "Cách mạng tháng Tám",
  "lessonNumber": 6,
  "documentId": null,
  "count": 5,
  "difficulty": "MEDIUM",
  "cognitiveLevel": "UNDERSTANDING"
}
```

Response:

```json
{
  "requestId": "...",
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
      "cognitiveLevel": "UNDERSTANDING",
      "sourceChunkIds": ["..."]
    }
  ],
  "retrieval": {
    "usedChunkIds": ["..."]
  }
}
```

### `POST /ai/index/rebuild`

Internal/admin only. Không public qua frontend.

Yêu cầu auth/policy phải chốt sau Goal 0.

## 2. Spring Boot public endpoint

Dự kiến:

```http
POST /api/quiz/generate
```

Spring Boot chịu trách nhiệm:

- Xác thực user.
- Validate count/grade/difficulty.
- Timeout và error mapping.
- Không trả internal debug data nếu không cần.
- Không để frontend biết địa chỉ hoặc key của Gemini.

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

Goal 0 phải map theo error schema hiện có của backend.

## 4. Validation rules

- `count`: giới hạn nhỏ trong MVP, giá trị cụ thể chốt sau audit.
- `grade`: 10, 11 hoặc 12.
- `difficulty`: enum của project hiện tại.
- `topK`: giới hạn server-side.
- Không cho client truyền raw prompt.
- Không cho client chỉ định model tùy ý.
