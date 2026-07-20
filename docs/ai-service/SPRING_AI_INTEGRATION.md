# Spring Boot ↔ AI Service Integration

## Contract và ranh giới

- Public: authenticated `POST /api/exams/ai/generate`.
- Internal: `POST /ai/quiz/generate`.
- Spring giữ JWT/auth, request validation, Style Example selection, error normalization và public response.
- FastAPI giữ retrieval, Fact Context, Gemini generation, repair và validation.
- Generated questions không được persist; frontend không gọi FastAPI trực tiếp.

## Backend paths

```text
backend/src/main/java/com/lichsuvn/backend/exam/ai/
├── api/             controller + public DTO
├── application/     orchestration, style mapping, metrics
├── client/          typed HTTP client + internal DTO
├── config/          app.ai-service properties + HTTP/1.1 client
├── domain/          read-only style candidate
└── infrastructure/  JDBC verified-style query
```

## Style Example mapping

Schema thật:

| Contract | Database field |
|---|---|
| Active bank | `exam_runtime_state.active_dataset_id` + `exam_datasets.status='ACTIVE'` |
| Public/verified | `exam_definitions.visibility_status='PUBLIC'`, `verification_status='VERIFIED'` |
| Single choice | `exam_questions.question_type='mcq'` |
| Question/explanation | `question_text`, `explanation` nonblank |
| Difficulty | `difficulty` lower-case → EASY/MEDIUM/HARD |
| Topic | `raw_topic`, hoặc `exam_topics.topic_slug/title` |
| Options | `exam_mcq_options.option_key/option_text/order_in_question` |
| Correct answer | đúng một `is_correct=true` |

`exam_questions` không có grade/lesson, per-question verified/active/public hay soft-delete field. Các trạng thái khả dụng nằm ở active dataset và exam definition; Spring không suy diễn field không tồn tại. Thứ tự chọn deterministic: exact topic+difficulty → exact topic → difficulty → `question_id`; tối đa ba. Definition HIDDEN/REVIEW_REQUIRED, non-MCQ, image question, blank, thiếu option hoặc nhiều correct đều bị loại.

Chỉ các field `question/options/correctOptionId/explanation/difficulty` được gửi. Internal database ID, audit, user, verification metadata và source claim không được gửi.

## Reliability và security

- Connect/read timeout: 5s/90s.
- HTTP/1.1 explicit; redirect và automatic retry disabled.
- Mỗi request có generated `X-Request-ID`; JWT không forward.
- Logs chỉ có request ID, user ID, grade/lesson/difficulty/count/style count/latency outcome; không có body/context/question/style/JWT.
- Micrometer: requests, success, partial, failure, latency, timeout, unavailable.
- FastAPI 409/422/502/503, timeout, connection và malformed response được map thành `ApiException` code riêng.

## Verification 2026-07-20

- Offline Goal 10 suites: 16 pass, gated smoke skip mặc định.
- Gated full-route smoke: count 1 và count 3 pass, một verified synthetic style được dùng, four-option/source assertions pass.
- H2 `exam_questions` và `exam_mcq_options` count trước/sau không đổi.
- AI regression: 112 pass, 3 skip; production Chroma count 414.
- Full backend: 166 test, một baseline error ngoài phạm vi vì thiếu `data/history-rag/v1`.
- Live JWT/cookie + MySQL smoke chưa chạy vì không có auth fixture và MySQL local không listen; actual SecurityFilterChain đã được kiểm thử bằng MockMvc authenticated/anonymous cases.

## Goal 11 frontend consumer

Authenticated route `/exams/ai` gọi Spring bằng shared `apiPostOnce`, giữ HttpOnly cookie và không replay generation. Typed parser/adapter xử lý full/partial/source/error; source chỉ hiện sau submit và warning được trình bày trung tính. Quiz/answers/score chỉ tồn tại trong React memory. Frontend không gửi Style Examples, Fact Context, model, source IDs hoặc API key và không gọi official exam persistence/submission API.
