# AI practice integration — /quiz end-to-end

> Hợp nhất từ `FRONTEND_AI_QUIZ_INTEGRATION.md` và `QUIZ_PRACTICE_FLOW.md`
> (canonicalization 2026-08-10 — hai file trùng ~90% nội dung, chỉ khác ngôn ngữ).
> Mô tả luồng tự luyện học sinh `/quiz`: frontend → Spring → FastAPI → RAG/Gemini → Spring → frontend.

## User flow

- `/quiz` là trang giới thiệu công khai.
- `/quiz/generate`, `/quiz/session/:sessionId`, `/quiz/result/:sessionId` và `/quiz/history` yêu cầu đăng nhập.
- `/exams/ai` là URL tương thích cũ và redirect sang `/quiz/generate`; `/exams` không còn card AI riêng.

Form gửi `{query, difficulty, count}`. Count giới hạn 1–10 (preset 3/5/10 hoặc số tùy chỉnh). Khi người dùng sửa textarea sau khi chọn preset, preset được reset để query hiển thị là nguồn sự thật. Thời lượng được suy ra từ số câu: 1–3 câu là 5 phút, 4–6 câu là 10 phút, 7–10 câu là 15 phút. Frontend gọi đúng một lần `POST /api/quiz/generate` bằng shared `apiPostOnce`, giữ HttpOnly cookie, có AbortController để hủy chờ và không tự retry.

Response được parse strict, chuyển sang `QuizSession` localStorage với `generatedBy: rag`, difficulty viết thường, topic là query và source SGK được đổi thành title/location. Grade của câu lấy từ nguồn; nhiều lớp hiển thị “Lớp 10–12”. Partial giữ trạng thái `generatedCount/requestedCount` để hiển thị cảnh báo, không retry.

Đáp án đúng, giải thích và nguồn chỉ xuất hiện sau khi nộp.

## API boundary

`POST /api/quiz/generate` là authenticated. Spring đặt `topK=5`, `grade=null`, `lessonNumber=null`, `documentId=null` trước khi gọi FastAPI, nên retrieval bao phủ toàn bộ corpus SGK lớp 10–12. Spring xác thực request, giữ JWT/auth, chuẩn hóa lỗi; validate grounded response và trả `questions`, `sources`, `warnings`, `generation`. Endpoint này **không gọi `AiGenerationReceiptRepository`** và không phụ thuộc bảng candidate/revision.

Sau khi nộp, frontend gửi metadata completion qua authenticated `POST /api/quiz/attempts` (`clientSessionId`, `topic`, `difficulty`, `totalQuestions`, `durationMs`). Backend lưu attempt idempotent theo `(userId, clientSessionId)` với `scoreAuthority=CLIENT_NOT_STORED` — đáp án/điểm **không được gửi lên**. Luồng này không tạo candidate và không gọi API review/publish.

Endpoint tương thích `POST /api/exams/ai/generate` giữ contract receipt; candidate/review/revision workflow là luồng teacher/admin riêng (xem `AI_QUESTION_LIFECYCLE.md`) và yêu cầu Flyway đầy đủ đến V38.

## Local data policy

Browser sở hữu local session/scoring: session, result và history lưu trong localStorage, tối đa 50 kết quả; mọi lần đọc đều kiểm tra `userId` để tài khoản khác không truy cập được. Frontend không gửi Style Examples, Fact Context, model, source IDs hoặc API key và không gọi official exam persistence/submission API.

## Frontend source

- `frontend/src/services/quizAiApi.ts` · `aiQuizApi.ts` · `practiceQuizAttemptApi.ts` — API callers.
- `/exams/ai` chỉ redirect; không có card AI riêng trên `/exams`.

## Kiểm thử

Final reconciliation 2026-08-21: the full frontend release gate passed 135/135 files and 1232/1232 tests, plus lint, TypeScript, Vite production build and `npm run build`. RAG-02 now validates covered critical facts before FastAPI returns success; after at most one repair, final failure is safely mapped and the suspicious question is not served. The Goal 16C/17A evidence below remains a historical integration snapshot.

Goal 16C đã kiểm tra authenticated runtime ở 1440×900, 1024×768, 768×1024 và 390×844, gồm generation/session/result, keyboard shortcuts, dialog focus trap/restoration, mobile progress và regression shared primitives của THPT. Goal 17A: encoding pass, ESLint 0 lỗi/0 cảnh báo, TypeScript pass, 536/536 Vitest pass, production build pass, backend/FastAPI suites và hai deterministic four-service Compose E2E runs. Live Gemini không được CI gọi.

Manual smoke: log in, mở `/quiz/generate`, generate một lần với local provider đã cấu hình, trả lời/nộp, xác nhận source trên result và history cô lập theo user.
