# AI Service RAG — Documentation Index

Tài liệu này là điểm bắt đầu bắt buộc cho mọi phiên làm việc liên quan đến module AI Service.

## Mục tiêu của bộ tài liệu

Giúp một AI hoặc thành viên mới hiểu được:

- Module AI Service dùng để làm gì.
- Dữ liệu đầu vào hiện có là gì.
- Kiến trúc và ranh giới với Spring Boot, React và module luyện thi.
- Tiến độ đã hoàn thành tới đâu.
- Việc tiếp theo phải làm là gì.
- Cách chạy, kiểm thử và bàn giao.

Bộ tài liệu này giúp giảm thời gian đọc toàn bộ code để lấy bối cảnh. Khi triển khai thay đổi, AI vẫn phải đọc các file code trực tiếp liên quan và xác minh bằng lệnh build/test.

## Thứ tự đọc bắt buộc

1. `AI_SERVICE_OVERVIEW.md`
2. `AI_SERVICE_STATUS.md`
3. `AI_SERVICE_IMPLEMENTATION_PLAN.md`
4. `AI_SERVICE_ARCHITECTURE.md`
5. `AI_SERVICE_DATA_CONTRACT.md`
6. `AI_SERVICE_API_CONTRACT.md`
7. `AI_SERVICE_DECISIONS.md`
8. `AI_SERVICE_RUNBOOK.md`
9. `AI_SERVICE_PROJECT_AUDIT.md` sau khi Codex tạo xong Goal 0

## Nguồn sự thật

Ưu tiên nguồn theo thứ tự:

1. Dữ liệu SGK canonical: `sgk_chunks.jsonl` và các báo cáo audit.
2. API/data contract đã được chốt trong tài liệu này.
3. Code và test đang chạy trên nhánh hiện tại.
4. Nội dung trong luận văn.
5. Giả định hoặc ghi chú cũ.

Khi tài liệu và code mâu thuẫn, không tự đoán. Ghi rõ mâu thuẫn vào `AI_SERVICE_STATUS.md`, xác minh bằng test, sau đó cập nhật tài liệu.

## Quy tắc cập nhật sau mỗi phiên

Mọi phiên có thay đổi module AI phải cập nhật tối thiểu:

- `AI_SERVICE_STATUS.md`: tiến độ, lệnh đã chạy, lỗi còn lại, next step.
- `AI_SERVICE_IMPLEMENTATION_PLAN.md`: đánh dấu task hoàn thành hoặc thay đổi phạm vi.
- `AI_SERVICE_DECISIONS.md`: thêm quyết định mới có ảnh hưởng kiến trúc, model, dữ liệu hoặc API.
- `AI_SERVICE_RUNBOOK.md`: cập nhật lệnh chạy nếu cấu hình thay đổi.

Không được đánh dấu `DONE` nếu chưa có bằng chứng từ build/test hoặc kiểm tra artifact.

## Trạng thái tóm tắt hiện tại

- Goal 17A local release gate: hoàn tất trên `fix/ai-service` tại
  `2c28c4c3`; Compose deterministic E2E 2/2 pass, 13/13 Testcontainers tests
  chạy thật và pass, cleanup không còn project resource.
- Quality baseline hiện tại: AI Service 308 pass/3 live-smoke skip, app coverage
  90%, combined coverage 85%; backend 260 tests/4 design-valid skip; frontend
  ESLint 0/0, TypeScript pass, 536/536 tests và production build pass.
- Bước dữ liệu HTML → Markdown sạch → structured blocks: hoàn thành.
- Bước Markdown/blocks → 459 chunks: hoàn thành.
- Embedding local TF-IDF + Random Projection 256 chiều: hoàn thành, chỉ dùng baseline.
- Gemini embedding production: hoàn tất 414 eligible chunks, dimension 768.
- ChromaDB production collection: hoàn tất 414 records, cosine, idempotent và persistent.
- Retrieval API, generation API và Spring integration: đã triển khai và smoke production pass.
- Frontend integration: luồng học sinh đã hợp nhất vào `/quiz`; `/quiz/generate` gọi authenticated `POST /api/quiz/generate`, lưu session/result/history tự học trong localStorage và `/exams/ai` chỉ redirect. Candidate/review là luồng teacher/admin riêng với publish chỉ dành cho admin.
- Current model là `gemini-2.5-flash`; candidate
  `gemini-3.5-flash-lite` mặc định disabled, rollout 0% và không cross-model
  fallback.

Xem chi tiết tại `AI_SERVICE_STATUS.md`.
