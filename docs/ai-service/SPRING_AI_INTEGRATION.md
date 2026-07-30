# Spring Boot ↔ AI Service Integration

> Goal 13D verified Spring against real MySQL/FastAPI with four real cookie-authenticated roles. Candidate lifecycle, provenance, conflict, and revision meters now complement generation and receipt-cleanup metrics.

## Contract và ranh giới

- Student practice: authenticated `POST /api/quiz/generate` (no receipt/database write; grade/lesson/document null and topK=5).
- Compatibility/admin: `POST /api/exams/ai/generate` keeps the receipt/candidate contract.
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

Authenticated route `/quiz/generate` gọi Spring bằng shared `apiPostOnce`, giữ HttpOnly cookie và không replay generation. Typed parser xử lý full/partial/source/error; source chỉ hiện sau submit và warning được trình bày trung tính. Session/result/history tự học được user-isolate trong localStorage; frontend không gửi Style Examples, Fact Context, model, source IDs hoặc API key và không gọi official exam persistence/submission API. `/exams/ai` chỉ là redirect tương thích.

## Goal 13 Spring integration

Candidate authorization is authority-specific, with controller `@PreAuthorize` and matching service guards. Auth responses expose current roles and permissions. Spring calls protected `/ai/provenance/validate` before submit/approve/publish, records sanitized outcomes, and never falls back to stale validation. Publish validation completes before the locked official insert transaction, so validation failure cannot create an official question.

## Goal 12 persistence boundary

Spring issues an opaque generation receipt after validating the compatibility generation response. Candidate creation resolves questions and provenance from that server receipt; it does not trust model/source identity supplied by the browser. `/api/exams/ai/candidates/**` requires authentication plus command-specific authority, repeated in the application layer: teacher can create/view/edit/submit/review/audit, while publish remains admin-only. Publish uses row locks and one transaction for official question/options/counts/candidate link/audit; failure rolls back and records best-effort `PUBLISH_FAILED` separately.

## Goal 13C orchestration

Spring exposes revision create/search/remap commands and remains the browser trust boundary. It sends only the configured internal token—not user JWT—to fixed FastAPI provenance paths. Canonical response metadata is authoritative; client titles/corpus/model fields are not accepted. Revision submit/approve/publish rerun fail-closed validation and base/head checks. Publish reuses official insert mapping but links a new row through the locked revision chain; teacher/admin permissions are checked in controller security and service methods.
