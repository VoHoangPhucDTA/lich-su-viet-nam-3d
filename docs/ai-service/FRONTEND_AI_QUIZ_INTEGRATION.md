# Frontend AI Quiz Integration

## Luồng luyện tập `/quiz`

- `/quiz` là trang giới thiệu công khai.
- `/quiz/generate`, `/quiz/session/:sessionId`, `/quiz/result/:sessionId` và `/quiz/history` yêu cầu đăng nhập.
- `/exams/ai` là URL tương thích cũ và redirect sang `/quiz/generate`; `/exams` không còn card AI riêng.

Form có gợi ý chủ đề, chủ đề/yêu cầu tùy chỉnh (tối đa 1.000 ký tự), độ khó EASY/MEDIUM/HARD và số câu 1–10 (preset 3/5/10 hoặc số tùy chỉnh). Khi người dùng sửa textarea sau khi chọn preset, preset được reset để query hiển thị là nguồn sự thật. Thời lượng được suy ra từ số câu: 1–3 câu là 5 phút, 4–6 câu là 10 phút, 7–10 câu là 15 phút. Frontend gọi đúng một lần `POST /api/quiz/generate` bằng `apiPostOnce`, có AbortController để hủy chờ và không tự retry.

Response được parse strict, chuyển sang `QuizSession` localStorage với `generatedBy: rag`, difficulty viết thường, topic là query và source SGK được đổi thành title/location. Grade của câu lấy từ nguồn; nhiều lớp hiển thị “Lớp 10–12”. Partial giữ trạng thái `generatedCount/requestedCount` để hiển thị cảnh báo, không retry.

Đáp án đúng, giải thích và nguồn chỉ xuất hiện sau khi nộp. Session, result và history vẫn là dữ liệu tự học trong localStorage, tối đa 50 kết quả; mọi lần đọc đều kiểm tra `userId` để tài khoản khác không truy cập được. Luồng này không tạo candidate và không gọi API review/publish.

## Backend boundary

Spring Boot xác thực request rồi gửi FastAPI với `grade=null`, `lessonNumber=null`, `documentId=null`, `topK=5`, nên retrieval bao phủ toàn bộ corpus SGK lớp 10–12. Endpoint self-practice không gọi `AiGenerationReceiptRepository` và không phụ thuộc các bảng candidate/revision. Endpoint tương thích `/api/exams/ai/generate` vẫn giữ receipt contract; candidate/review/revision workflow hiện cần Flyway đầy đủ đến V38.

## Kiểm thử

Goal 16C đã kiểm tra authenticated runtime ở 1440×900, 1024×768, 768×1024 và 390×844, gồm generation/session/result, keyboard shortcuts, dialog focus trap/restoration, mobile progress và regression shared primitives của THPT. Baseline Goal 17A: encoding pass, ESLint 0 lỗi/0 cảnh báo, TypeScript pass, 536/536 Vitest pass và production build pass. Tiếp tục chạy các gate này cùng `git diff --check` trước khi bàn giao.
