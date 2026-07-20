# AI Service RAG — Architecture

## Kiến trúc logic

```text
┌──────────────┐
│ React        │
└──────┬───────┘
       │ POST /api/quiz/generate
       ▼
┌──────────────┐
│ Spring Boot  │
│ Auth/Policy  │
└──────┬───────┘
       │ internal HTTP
       ▼
┌─────────────────────────────┐
│ FastAPI AI Service          │
│                             │
│ Retrieval                   │
│ Prompt/Generation           │
│ Validation                  │
└──────┬───────────┬──────────┘
       │           │
       ▼           ▼
┌──────────────┐  ┌──────────────┐
│ ChromaDB     │  │ Gemini API   │
│ SGK vectors  │  │ Embed/Gen    │
└──────────────┘  └──────────────┘
       ▲
       │
┌──────────────┐
│ sgk_chunks   │
│ canonical    │
└──────────────┘

Spring Boot/MySQL
└── verified exam questions → Style Examples
```

## Luồng indexing

```text
sgk_chunks.jsonl
→ validate schema/hash/version
→ create embeddings
→ batch upsert ChromaDB
→ index manifest
→ retrieval smoke tests
```

## Luồng sinh câu hỏi

```text
User request
→ Spring validates request
→ FastAPI builds retrieval query
→ query embedding
→ Chroma metadata filter + similarity search
→ top-k chunks
→ Fact Context
→ fetch verified Style Examples
→ Gemini structured generation
→ validators
→ response with sourceChunkIds
```

## Ranh giới trách nhiệm

### React

- Nhập lựa chọn người dùng.
- Hiển thị quiz, loading, lỗi, lời giải và nguồn.
- Không lưu API key.
- Không gọi Gemini/Chroma trực tiếp.

### Spring Boot

- Xác thực và phân quyền.
- Validation nghiệp vụ.
- Rate limit/timeout.
- Kết nối dữ liệu module luyện thi.
- Chuẩn hóa lỗi cho frontend.
- Có thể lưu audit/history nếu phạm vi yêu cầu.

### FastAPI AI Service

- Indexing orchestration.
- Retrieval.
- Fact Context assembly.
- Prompting và model call.
- Structured output parsing.
- Validation và retry.
- Debug/evaluation endpoint nội bộ.

### ChromaDB

- Lưu embeddings, documents và metadata.
- Similarity search và metadata filter.
- Không thay thế MySQL cho dữ liệu nghiệp vụ.

### MySQL

- User, đề thi, câu hỏi, options, attempt, điểm.
- Verified exam questions dùng làm Style Examples.

## Cấu trúc thư mục đề xuất

Goal 0 phải điều chỉnh theo repository thực tế.

```text
project-root/
├── backend/                     # tên thực tế cần audit
├── frontend/                    # tên thực tế cần audit
├── ai-service/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── embedding/
│   │   ├── vectorstore/
│   │   ├── retrieval/
│   │   ├── generation/
│   │   ├── validation/
│   │   └── main.py
│   ├── data/
│   │   └── sgk/
│   ├── scripts/
│   ├── tests/
│   ├── .env.example
│   └── requirements.txt hoặc pyproject.toml
└── docs/ai-service/
```

## Quy tắc versioning

- Collection name phải chứa corpus/index version.
- Đổi embedding model/dimension → collection mới.
- Đổi chunking logic làm thay đổi chunk IDs/content → corpus version mới.
- Không ghi đè index production nếu chưa qua retrieval evaluation.

## Luồng retrieval production — Goal 8

```text
RetrievalRequest
→ validate query/topK/typed filters
→ gemini-retrieval-query-v1
→ Gemini gemini-embedding-2 query vector (768)
→ validate dimension và finite values
→ read-only Chroma query_embeddings (cosine, candidate pool)
→ typed metadata + pending rejection + filter compliance
→ stable distance order → deduplicate → per-document diversity → fallback
→ topK RetrievalResult
→ deterministic Fact Context + ordered sourceChunkIds
→ RetrievalResponse
```

API, CLI và evaluator dùng chung `RetrievalService`. Cache evaluator trong `storage/evaluation-cache/` không tham gia production API. Health chỉ đọc file/report/config; không gọi Gemini, không query Chroma và không load corpus.

## Luồng generation production — Goal 9

```text
GenerationRequest
→ RetrievalService (read-only production collection)
→ ordered RetrievalResult
→ deterministic Fact Context [SOURCE chunkId=...]
→ optional Style Examples (STYLE ONLY, không phải fact source)
→ Prompt grounded-mcq-v1 + JSON Schema grounded-mcq-schema-v1
→ Gemini gemini-2.5-flash structured output
→ strict parse (unknown field/fence/schema đều bị từ chối)
→ semantic validators + deterministic duplicate checker
→ tối đa một targeted repair nếu cần
→ GenerationResponse (questions + sources + metadata + warnings)
```

API, CLI và evaluator dùng chung `GenerationService`. Service chỉ chấp nhận `sourceChunkIds` thuộc Fact Context đã retrieval; không dùng pending-review chunk, không ghi MySQL và không đổi Chroma. Generation cache chỉ dùng trong evaluator, có identity gồm request, source ID/hash, model, temperature, prompt/schema version và style hash.

`generationReady` là readiness nhẹ từ retrieval readiness + model/key configuration; health không gọi Gemini. Goal 10 sẽ để Spring Boot lấy Style Examples đã verified từ MySQL và truyền vào request, giữ ranh giới FastAPI không truy cập dữ liệu nghiệp vụ.

## Spring integration production — Goal 10

```text
React (Goal 11)
→ POST /api/exams/ai/generate + JWT/cookie
→ Spring Security + public request validation
→ read-only verified Style Example selection từ MySQL
→ public request + style-only DTO
→ JDK HttpClient HTTP/1.1, X-Request-ID, no retry
→ POST /ai/quiz/generate
→ FastAPI retrieval → Fact Context → Gemini → validation
→ typed Spring defensive validation
→ ApiResponse<AiQuizGenerateResponse>
```

Spring không gọi health trước mỗi generation request, không forward JWT, không biết Gemini key và không persist generated questions. Public response chỉ giữ questions, sources, warnings và requested/generated/partial; model, collection, prompt/schema version và internal latency chỉ tồn tại trong internal DTO.

Style query là read-only. Do schema exam bank không có grade/lesson, Spring không suy diễn các field đó; query ưu tiên exact topic/difficulty từ `raw_topic` hoặc `exam_topics`, sau đó difficulty và stable `question_id`. Grade/lesson của public request chỉ đi vào FastAPI retrieval filters.

## Frontend integration — Goal 11

```text
React /exams/ai (authenticated)
→ shared apiPostOnce + HttpOnly cookie
→ POST /api/exams/ai/generate
→ Spring → verified Style Examples → FastAPI retrieval/generation
→ Spring normalized response
→ strict frontend parser → MCQ adapter
→ React memory-only quiz → local scoring/source review
```

Frontend không có FastAPI base URL, Gemini key, prompt, raw filter hoặc persistence adapter. State chuyển `IDLE → VALIDATING → GENERATING → READY → SUBMITTED`; lỗi đi tới `ERROR`. Abort chỉ dừng chờ browser và không khẳng định request upstream đã dừng. `MCQQuestionCardV2`, `ExamQuickNavigator` và `ExamPracticeHeader` được tái sử dụng; adapter giữ source mapping ngoài official exam/session schema.
