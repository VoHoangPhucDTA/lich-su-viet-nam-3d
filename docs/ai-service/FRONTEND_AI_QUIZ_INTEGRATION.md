# Frontend AI Quiz Integration

## Luồng luyện tập `/quiz`

- `/quiz` là trang giới thiệu công khai.
- `/quiz/generate`, `/quiz/session/:sessionId`, `/quiz/result/:sessionId` và `/quiz/history` yêu cầu đăng nhập.
- `/exams/ai` là URL tương thích cũ và redirect sang `/quiz/generate`; `/exams` không còn card AI riêng.

Form chỉ có chủ đề/yêu cầu (tối đa 1.000 ký tự), độ khó EASY/MEDIUM/HARD và số câu 1–10 (preset 3/5/10). Thời gian làm bài cố định 15 phút. Frontend gọi đúng một lần `POST /api/quiz/generate` bằng `apiPostOnce`, có AbortController để hủy chờ và không tự retry.

Response được parse strict, chuyển sang `QuizSession` localStorage với `generatedBy: rag`, difficulty viết thường, topic là query và source SGK được đổi thành title/location. Grade của câu lấy từ nguồn; nhiều lớp hiển thị “Lớp 10–12”. Partial giữ trạng thái `generatedCount/requestedCount` để hiển thị cảnh báo, không retry.

Đáp án đúng, giải thích và nguồn chỉ xuất hiện sau khi nộp. Session, result và history vẫn là dữ liệu tự học trong localStorage, tối đa 50 kết quả; mọi lần đọc đều kiểm tra `userId` để tài khoản khác không truy cập được. Luồng này không tạo candidate và không gọi API review/publish.

## Backend boundary

Spring Boot xác thực request rồi gửi FastAPI với `grade=null`, `lessonNumber=null`, `documentId=null`, `topK=5`, nên retrieval bao phủ toàn bộ corpus SGK lớp 10–12. Endpoint mới không gọi `AiGenerationReceiptRepository` và không phụ thuộc migration V35–V37. Endpoint tương thích `/api/exams/ai/generate` vẫn giữ receipt/candidate contract cho backend cũ và admin workflow.

## Kiểm thử

Kiểm tra parser/API, form, routing, session, result và history bằng Vitest; chạy `npx tsc -b`, `npm run build` và `git diff --check` trước khi bàn giao.
