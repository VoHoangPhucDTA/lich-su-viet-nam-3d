# AI Service — Project Audit

## Phạm vi audit

Bản tối thiểu này được tạo trong Goal 7A/7B vì tài liệu audit chưa tồn tại. Audit chỉ xác minh phần cần thiết để dựng nền AI Service; không sửa backend, frontend hay deployment.

## Repository đã xác minh

- Root: `D:/KLTN/lich-su-viet-nam-3d`.
- Branch thực tế: `ai_service` (không phải `ai-service` như nội dung yêu cầu).
- Commit: `99296ca31a953027dc91f4cd122cdd27b45a5ca9`.
- Python: 3.10.11.
- Các module cấp cao có `backend/`, `frontend/`, `ai-service/`, `docs/`.
- Không checkout, reset, clean, stash, commit hoặc đổi branch trong phiên.

## AI Service trước Goal 7A/7B

- `main.py`: FastAPI prototype một file, có health mẫu và generation endpoint giả.
- `requirements.txt`: pip freeze lớn chứa cả Chroma/LangChain dù nền hiện tại chưa sử dụng.
- Corpus và report đang là file untracked trong `ai-service/data/corpus/`.

## Kết luận cho cấu trúc

- Giữ `ai-service/` là module độc lập.
- Dùng entry point `app.main:app`; root `main.py` chỉ tương thích chạy trực tiếp.
- Runtime dependency được thu gọn cho FastAPI/config; Gemini và Chroma không thuộc Goal này.
- Corpus canonical đặt tại `ai-service/data/corpus/sgk_chunks.jsonl` và không bị sửa.

## Chưa audit trong phạm vi này

- Auth/error contract của Spring Boot.
- Component quiz và contract frontend.
- Docker/deployment topology.
- MySQL style examples.

Các mục này không cản Goal 7A/7B và phải được audit trước goal tích hợp tương ứng.
