# AI Service RAG — Documentation Index

Tài liệu này là điểm bắt đầu bắt buộc cho mọi phiên làm việc liên quan đến module AI Service.

> Canonicalization 2026-08-10: hợp nhất workflow/integration/quality thành các tài liệu
> current duy nhất; xóa implementation plan, project audit và audit dumps cũ. Bộ hiện tại
> phản ánh đúng source (FastAPI 66 modules, Spring `exam/ai`, frontend `/quiz`).

## Mục tiêu của bộ tài liệu

Giúp một AI hoặc thành viên mới hiểu được:

- Module AI Service dùng để làm gì.
- Dữ liệu đầu vào hiện có là gì.
- Kiến trúc và ranh giới với Spring Boot, React và module luyện thi.
- Tiến độ đã hoàn thành tới đâu.
- Việc tiếp theo phải làm là gì.
- Cách chạy, kiểm thử và bàn giao.

Bộ tài liệu giúp giảm thời gian đọc toàn bộ code để lấy bối cảnh. Khi triển khai thay đổi,
AI vẫn phải đọc các file code trực tiếp liên quan và xác minh bằng lệnh build/test.

## Thứ tự đọc bắt buộc

1. `AI_SERVICE_OVERVIEW.md` — module làm gì, hai use case (self-practice + candidate)
2. `AI_SERVICE_STATUS.md` — trạng thái hiện hành (nguồn sự thật trạng thái)
3. `AI_SERVICE_ARCHITECTURE.md` — kiến trúc React → Spring → FastAPI → Chroma/Gemini
4. `AI_SERVICE_API_CONTRACT.md` — FastAPI internal + Spring public endpoints
5. `AI_SERVICE_DATA_CONTRACT.md` — chunk schema, corpus, metadata
6. `AI_SERVICE_DECISIONS.md` — ADR (tại sao)
7. `AI_SERVICE_RUNBOOK.md` — lệnh vận hành phần Python

## Tài liệu hỗ trợ (integration / workflow / quality)

- `AI_QUESTION_LIFECYCLE.md` — vòng đời câu hỏi AI: candidate → review → publish → revision
- `AI_PRACTICE_INTEGRATION.md` — luồng tự học `/quiz` end-to-end (frontend → Spring → FastAPI)
- `SPRING_AI_INTEGRATION.md` — ranh giới và DTO mapping Spring ↔ FastAPI
- `AI_SERVICE_QUALITY_AND_VALIDATION.md` — CI jobs, test layers, E2E/deployment readiness
- `AI_SERVICE_SECURITY_AND_PROVENANCE.md` — bảo mật, phân quyền, provenance fail-closed
- `AI_TEACHER_EVALUATION_PROTOCOL.md` — thực nghiệm giáo viên (protocol v1; chưa thu dữ liệu)
- `GOAL15_BASELINE.md` — snapshot đo baseline (2026-07-28), nguồn cho bằng chứng KLTN
- `SELF_PRACTICE_LATENCY_AUDIT.md` — đo latency tự luyện (2026-07-31), nguồn cho bằng chứng KLTN

## Implementation lives here

- `ai-service/app/` — FastAPI: `api/routes/{generation,retrieval,provenance,health}.py`, `config.py`, `generation/`, `retrieval/`, `embedding/`, `vectorstore/`
- `backend/src/main/java/com/lichsuvn/backend/exam/ai/` — Spring: `api/` controllers, `application/`, `client/`, `infrastructure/`
- `frontend/src/services/{quizAiApi,aiQuizApi,practiceQuizAttemptApi}.ts` — frontend callers

## Nguồn sự thật

Ưu tiên nguồn theo thứ tự:

1. Dữ liệu SGK canonical: `sgk_chunks.jsonl` và các báo cáo audit.
2. API/data contract đã được chốt trong tài liệu này.
3. Code và test đang chạy trên nhánh hiện tại.
4. Nội dung trong luận văn.
5. Giả định hoặc ghi chú cũ.

Khi tài liệu và code mâu thuẫn, không tự đoán. Ghi rõ mâu thuẫn vào `AI_SERVICE_STATUS.md`,
xác minh bằng test, sau đó cập nhật tài liệu.

## Quy tắc cập nhật sau mỗi phiên

Mọi phiên có thay đổi module AI phải cập nhật tối thiểu:

- `AI_SERVICE_STATUS.md`: tiến độ, lệnh đã chạy, lỗi còn lại, next step.
- `AI_SERVICE_DECISIONS.md`: thêm quyết định mới có ảnh hưởng kiến trúc, model, dữ liệu hoặc API.
- `AI_SERVICE_RUNBOOK.md`: cập nhật lệnh chạy nếu cấu hình thay đổi.

Không được đánh dấu `DONE` nếu chưa có bằng chứng từ build/test hoặc kiểm tra artifact.

## Trạng thái tóm tắt hiện tại

- Final reconciliation (2026-08-21): RAG-01 closed with 60 retrieval cases (59 scored + 1 control) and a separate 27-task/54-output paired generation evaluation. RAG achieved 23/27 semantic PASS versus 13/27 for Gemini-only on this fixed source-aligned benchmark. RAG-02 closed with a bounded two-layer runtime factual guard over 10 curated critical facts and controlled failure after at most one repair.
- Final offline regression: 394 PASS, 3 deselected, 9 warnings; RAG-01 test 33 PASS; focused RAG-02 24 PASS; Ruff PASS; provider calls 0. Final frontend release gate: 135/135 files, 1232/1232 tests, lint/build/TypeScript/Vite PASS.
- The Goal 17A counts below are retained as historical baseline evidence, not the final project totals. See `AI_SERVICE_STATUS.md` and `docs/review/fix-teacher/final-handoff/` for the reconciled thesis wording and limitations.

- Goal 17A local release gate: hoàn tất trên `fix/ai-service` tại `2c28c4c3`; Compose
  deterministic E2E 2/2 pass, 13/13 Testcontainers tests chạy thật và pass, cleanup không
  còn project resource.
- Historical Goal 17A quality baseline: AI Service 308 pass/3 live-smoke skip, app coverage 90%,
  combined coverage 85%; backend 260 tests/4 design-valid skip; frontend ESLint 0/0,
  TypeScript pass, 536/536 tests và production build pass.
- Student flow `/quiz`: authenticated `POST /api/quiz/generate`, không receipt/candidate,
  session/result/history tự học trong localStorage; `/exams/ai` chỉ redirect. Candidate/
  review/revision là luồng teacher/admin riêng, publish chỉ dành cho admin.
- Current model `gemini-2.5-flash`; candidate `gemini-3.5-flash-lite` disabled, rollout 0%,
  không cross-model fallback.

Xem chi tiết tại `AI_SERVICE_STATUS.md`.
