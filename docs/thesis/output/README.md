# Thesis synchronization evidence package

Ngày audit: 2026-07-21. Repository: `lich-su-viet-nam-3d`; branch `main`; baseline commit `5a8a8323bfbd7b5119add79f5c575509cb7fcd72` (merge PR #25 terrain update). Working tree trước audit có thay đổi sẵn của người dùng: 644 đường dẫn bị xoá/modified và 9 nhóm file untracked; audit không reset hay xoá các thay đổi này.

## Cách đọc

- `00`–`09`: snapshot, gap analysis, feature/route/API/database/use-case catalog.
- `10`: UML/diagram manifest; các `.puml` được kiểm tra cấu trúc nhưng chưa render vì không có PlantUML JAR.
- `11`–`14`: kiểm thử, phiên bản, vấn đề và giới hạn.
- `15`–`19`: fact sheet và change map cho Chương 3–6.
- `thesis_evidence.json`: máy đọc được, mỗi claim quan trọng có status và evidence path.
- `raw/`: snapshot, log đã làm sạch và terrain audit JSON; không chứa secrets.
- `legacy-usecase/`: bản sao trước chỉnh sửa của 9 file trong `usecase/`.

## Trạng thái bằng chứng

Frontend TypeScript và direct Vite build PASS; curated Vitest PASS (45 tests); full frontend script TIMEOUT. Backend package PASS; backend test có 190 pass, 1 error do thiếu `data/history-rag/v1`, 15 skip do Docker unavailable. AI pytest BLOCKED vì virtualenv không có `pytest`. Runtime DB/AI/TTS/Cloudinary chưa được xác minh.

## Render sơ đồ

Các file PlantUML là nguồn kiểm toán. Sau khi có PlantUML JAR được người dùng phê duyệt, chạy `java -jar plantuml.jar -tpng -tsvg docs/thesis/output/uml/*.puml docs/thesis/output/uml/sequences/*.puml` từ repository. Hiện `diagrams/png` và `diagrams/svg` chỉ là thư mục chờ render, không có ảnh giả.

## Screenshots

Không tự động chụp ảnh khi không có backend/database runtime đáng tin cậy. Xem `screenshots/README.md` để có checklist cho 10 placeholder Hình 5.1–5.10 trong Word.

## Phạm vi chỉnh sửa

Không chỉnh Word gốc `docs/thesis/input/KLTN_lichsuvn.docx`, production source, migrations, dataset, tests hoặc secrets. Chỉ output audit và file use-case được phép cập nhật được đưa vào commit docs-only.
