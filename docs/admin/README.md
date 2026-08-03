# Admin module

Tài liệu này mô tả trạng thái Admin sau Phase 11. Phạm vi hiện có gồm Dashboard,
danh sách/chi tiết sự kiện và người dùng, các mutation sự kiện được giới hạn theo
section, cùng mutation role/status người dùng có optimistic concurrency. Đây không
phải giao diện chỉnh sửa `raw_json` hay công cụ vận hành production database.

## Điểm vào

- Frontend route: `/admin/dashboard`, `/admin/events`, `/admin/events/new`,
  `/admin/events/:id`, `/admin/events/:id/edit`, `/admin/users`,
  `/admin/users/:id`.
- Backend controller: `backend/src/main/java/com/lichsuvn/backend/admin/api/AdminController.java`.
- Frontend API contract: `frontend/src/services/adminApi.ts`.
- Browser E2E: `frontend/e2e/admin` và `scripts/e2e/run_admin_e2e.py`.

## Ranh giới an toàn

- Authentication chỉ qua cookie HttpOnly; application Bearer token không còn được
  chấp nhận.
- Mutation dùng CSRF header lấy từ `GET /api/auth/csrf` và cookie tương ứng.
- URL `/api/admin/**` và các application facade Admin đều yêu cầu `ROLE_admin`.
- Version `updatedAt` là chuỗi opaque sáu chữ số thập phân; client không parse qua
  JavaScript `Date`.
- Public event chỉ nhận `mapData` đã sanitize; Admin API không trả toàn bộ
  `raw_json`, `sourceJson`, provenance `local:` hoặc private package metadata.
- Full event PUT, legacy event status, hard delete, legacy single-role và user
  delete vẫn bị quarantine bằng 409 ổn định.

## Tài liệu liên quan

- [Kiến trúc](ADMIN_ARCHITECTURE.md)
- [API và authorization](ADMIN_API_AUTHORIZATION.md)
- [Báo cáo verification](ADMIN_VERIFICATION_REPORT.md)
- [Checklist triển khai](ADMIN_DEPLOYMENT_CHECKLIST.md)
- [Giới hạn đã biết](ADMIN_KNOWN_LIMITATIONS.md)

Không lưu credential, trace Playwright hay payload nhạy cảm trong thư mục này.
