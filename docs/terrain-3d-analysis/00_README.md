# Phân tích chức năng xem địa hình 3D theo sự kiện lịch sử

## Mục tiêu

Bộ tài liệu này ghi lại kết quả phân tích tĩnh repository và kế hoạch triển khai chức năng **xem địa hình 3D chi tiết của sự kiện lịch sử** trên route `/map`. Phạm vi gồm kiến trúc runtime, Cesium, API, hợp đồng `geo_type`, dữ liệu vị trí, khoảng cách so với yêu cầu sản phẩm, state/camera, kiểm thử và nội dung bàn giao cho AI triển khai sau.

## Trạng thái nhiệm vụ

- Trạng thái: **hoàn tất phân tích; chưa triển khai chức năng**.
- Chỉ các tệp Markdown trong `docs/terrain-3d-analysis/` được tạo.
- Không sửa frontend, backend, migration, dữ liệu, dependency hay luồng review/mapping hình ảnh.
- Không cài package, không format/refactor repository, không commit và không push.
- Kết luận dựa trên source hiện có. Nội dung không thể xác minh tĩnh được đánh dấu `UNVERIFIED`.

## Snapshot Git trước khi phân tích

Lệnh bắt buộc đã chạy:

```text
git status --short
git branch --show-current
```

Kết quả:

```text
branch: main

?? .editorconfig
?? PULL_REQUEST_UI_REFACTOR.md
?? docs/ui-refactor/
```

Ba mục untracked trên đã tồn tại trước nhiệm vụ và không bị chỉnh sửa. Snapshot kết thúc và kết quả kiểm tra phạm vi thay đổi được ghi ở phần cuối tài liệu này.

## Danh sách tài liệu

1. `00_README.md` — phạm vi, trạng thái, thứ tự đọc và snapshot Git.
2. `01_REPOSITORY_STRUCTURE.md` — frontend/backend/data thực tế và các workspace phụ.
3. `02_RUNTIME_ARCHITECTURE.md` — kiến trúc runtime và sequence chọn sự kiện.
4. `03_MAP_AND_CESIUM_CURRENT_FLOW.md` — luồng `/map`, Cesium, camera, handler và cleanup hiện tại.
5. `04_GEO_DATA_CONTRACT.md` — hợp đồng sáu `geo_type`, nguồn dữ liệu và các điểm không thống nhất.
6. `05_BACKEND_API_CONTRACT.md` — endpoint, controller/service/repository/DTO và nhu cầu thay đổi backend.
7. `06_FEATURE_GAP_ANALYSIS.md` — so sánh yêu cầu sản phẩm với khả năng hiện tại.
8. `07_IMPLEMENTATION_PLAN.md` — kế hoạch 14 phase và bảng thay đổi theo tệp.
9. `08_TEST_AND_ACCEPTANCE_PLAN.md` — test matrix và acceptance criteria Given/When/Then.
10. `09_OPEN_QUESTIONS_AND_BLOCKERS.md` — chỉ các câu hỏi không thể kết luận từ repository.
11. `10_FILES_REQUIRED_FOR_IMPLEMENTATION.md` — gói tệp cần chuyển cho AI triển khai.
12. `11_IMPLEMENTATION_HANDOFF_PROMPT.md` — prompt hoàn chỉnh cho giai đoạn triển khai.

## Cách đọc

- Đọc `01` → `05` để hiểu **hệ thống hiện tại** và nguồn sự thật runtime.
- Đọc `06` để thấy phần đã có, còn thiếu hoặc bị chặn.
- Đọc `07` và `08` trước khi sửa code.
- Giải quyết các blocker bắt buộc trong `09`.
- Dùng `10` và `11` làm gói bàn giao cho một phiên AI khác.

Mọi đường dẫn và số dòng đều tính từ repository root, ví dụ `frontend/src/pages/MapPage.tsx:212-235`. Với tệp JSONL, số dòng là số record trong tệp.

## Kết luận điều hướng nhanh

- Frontend phục vụ route `/map`: `frontend/`; route được khai báo tại `frontend/src/App.tsx:69-76`.
- Trang quản lý state bản đồ: `frontend/src/pages/MapPage.tsx:212-235`.
- Cesium component chính: `frontend/src/components/CesiumMap.tsx:39-64`.
- Popup chính: `frontend/src/components/EventPopup.tsx:15-47`.
- Backend API chính: Spring Boot trong `backend/`; event endpoints tại `backend/src/main/java/com/lichsuvn/backend/event/api/EventController.java:23-82`.
- Viewer hiện dùng `EllipsoidTerrainProvider`, vì vậy **chưa hiển thị địa hình độ cao thật** (`frontend/src/components/CesiumMap.tsx:98-115`).
- Dữ liệu nguồn có sáu loại: `point`, `multi_point`, `multi_polygon`, `mixed`, `nationwide`, `no_location`; các layer hiện tại đang làm mất thông tin khi quy chúng về bốn tên cũ. Chi tiết ở `04_GEO_DATA_CONTRACT.md`.

## Snapshot kiểm tra kết thúc

Phần này được cập nhật sau lượt kiểm tra cuối:

- `git status --short`: xem báo cáo cuối của nhiệm vụ.
- `git diff --stat`: không thể hiện tệp untracked; được chạy theo yêu cầu để xác nhận không có diff tracked.
- `git diff -- docs/terrain-3d-analysis`: không thể hiện tệp mới chưa stage; được chạy theo yêu cầu.
- Danh sách đầy đủ tệp mới được kiểm tra bằng `git status --short --untracked-files=all -- docs/terrain-3d-analysis`.
