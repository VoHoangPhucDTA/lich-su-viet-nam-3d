# Admin deployment checklist

## Trước triển khai

- [ ] Checkout đúng commit đã review; working tree không chứa fixture/trace/secret.
- [ ] Java 21, Node 22 và Docker khả dụng.
- [ ] `APP_ALLOWED_ORIGINS` chỉ gồm origin HTTPS cụ thể, không có `*`.
- [ ] `APP_COOKIE_SECURE=true`; nếu `SameSite=None` thì Secure bắt buộc.
- [ ] JWT secret, datasource và OAuth/storage credentials đến từ secret manager.
- [ ] Mail/AI/TTS/Cloudinary chỉ bật khi môi trường đó thực sự cần và đã cấu hình.
- [ ] Xác nhận engine remote là MySQL hay TiDB, exact version và tương thích với
  artifact/Flyway đã review.
- [ ] Có backup trước rollout bao gồm `flyway_schema_history`, user/role và event
  aggregates; đã có bằng chứng restore thành công trên clone/disposable database.
- [ ] Đã chạy rehearsal trên clone/staging với cùng engine/version, cùng cấu hình
  migration và dữ liệu đủ đại diện.
- [ ] Tài khoản migration có đúng quyền tối thiểu; maintenance window và owner
  rollback đã được phê duyệt.
- [ ] Flyway history V1–V39 checksum khớp artifact được review; không repair.
- [ ] Chạy `flyway info` và `flyway validate` trên target đã xác nhận, trước mọi
  migration; không có failed row hoặc checksum mismatch.
- [ ] Có ít nhất hai tài khoản Admin ở trạng thái active và đã kiểm tra luồng
  self/last-admin trước rollout.
- [ ] Full backend/frontend/Playwright evidence trong verification report còn áp dụng.

## Build và smoke

- [ ] Backend artifact build bằng Java 21.
- [ ] Frontend build dùng API origin production mong đợi.
- [ ] Health public chỉ trả trạng thái tổng quát, không component/datasource/env.
- [ ] Anonymous 401; student/teacher 403; Admin login cookie-only thành công.
- [ ] CSRF bootstrap no-store; unsafe request thiếu token bị từ chối.
- [ ] Dashboard initial load chỉ gọi aggregate endpoint.
- [ ] Event list/detail, draft create, một optimistic update và conflict hoạt động.
- [ ] User list/detail và một mutation role/status an toàn hoạt động.
- [ ] Public event không có `raw_json`, `sourceJson`, `local:` hoặc private metadata.
- [ ] Backend và frontend được rollout phối hợp: frontend credentialed origin khớp
  `APP_ALLOWED_ORIGINS`, cookie Secure/SameSite và CSRF header của backend.

## Rollback

Application rollback dùng artifact/commit trước đó. Schema V1–V39 không bị Phase
11 thay đổi nên Phase 11 không có schema reversal. Nếu deployment gặp lỗi:

1. dừng rollout mới;
2. giữ nguyên database;
3. deploy lại artifact Phase 10 đã xác minh;
4. kiểm tra cookie/CSRF/CORS và health;
5. không dùng Flyway repair hay SQL ad-hoc;
6. không rollback authentication sang phiên bản bỏ qua `auth_version` sau khi đã
   có user role/status mutation, vì credential cũ có thể sống lại.

## Sau triển khai

- [ ] Không có token, email, reset/verification link, raw audit snapshot trong log.
- [ ] Không có container/test process Phase 11 trên host.
- [ ] Failure trace nếu có được giới hạn quyền, retention tối đa 2 ngày và không
  sao chép vào docs/khóa luận.
- [ ] Ghi lại release ID, checksum artifact và kết quả smoke mà không ghi credential.
