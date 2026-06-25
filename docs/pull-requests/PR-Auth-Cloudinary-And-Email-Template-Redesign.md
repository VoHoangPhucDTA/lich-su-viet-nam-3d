[Auth] Tích hợp Cloudinary Avatar, thiết kế lại Email Template và cải thiện UI/UX Authentication
#IssueNumber

Các thay đổi trong lần này:

1. Tích hợp Cloudinary cho ảnh đại diện

- Thêm CloudinaryService để upload avatar từ Google/Facebook lên Cloudinary
- Gán avatar mặc định từ Cloudinary cho user đăng ký bằng email
- Fallback graceful khi chưa cấu hình Cloudinary

2. Thiết kế lại Email Template

- Email xác thực và đặt lại mật khẩu dùng HTML template chuyên nghiệp
- Layout table-based tương thích Gmail, Outlook và mobile
- SVG icon, gradient header, căn giữa tiêu đề và CTA button

3. Cải thiện UI/UX Authentication

- Đổi theme mặc định từ Dark sang Light Mode
- Sửa lỗi dialog xác thực email không theo theme
- Thiết kế lại AuthFormMessage với CSS theme-aware (tương phản tốt hơn ở Light Mode)
- Custom Google OAuth button với SVG icon và loading state

4. Bảo mật: Rate limiting đăng nhập

- AuthRateLimiter: khóa tài khoản 15 phút sau 5 lần sai
- JavaDoc PasswordPolicy và AuthRateLimiter

5. Chuẩn hóa cấu hình

- Chuyển frontend URL từ https:// sang http://
- Gỡ @vitejs/plugin-basic-ssl (không cần với Vite proxy)

6. Đồng bộ tài liệu

- Thêm HTML Use Case và PUML sequence diagrams cho 4 luồng auth
- Cập nhật comment code, JavaDoc khớp với implementation
- Đồng bộ HTML doc, PUML và code (Cloudinary participant, step reference)

7. Bug fixes từ code review (post-review)

- Thêm rate limiting cho GET /verify-email (chống brute-force token)
- Sửa CloudinaryService.getDefaultAvatarUrl() không sinh URL 404
- Đổi ForgotPasswordPage success card từ hardcoded rgba sang CSS theme-aware class

Hướng dẫn Test:

1. Kiểm tra theme mặc định
   Route: http://localhost:5173 (tab ẩn danh)
   Kết quả: Giao diện Light Mode

2. Kiểm tra đăng ký và dialog xác thực
   Route: http://localhost:5173/register
   Nhập email + password hợp lệ
   Kết quả: Dialog xác thực hiển thị đúng theme

3. Kiểm tra thông báo lỗi Light Mode
   Route: http://localhost:5173/login
   Chuyển Light Mode, nhập sai email/password
   Kết quả: Lỗi hiển thị rõ ràng, dễ đọc

4. Kiểm tra email template
   Route: http://localhost:5173/forgot-password
   Nhập email đã đăng ký, kiểm tra Mailtrap
   Kết quả: Tiêu đề căn giữa, CTA căn giữa, icon hiển thị

5. Kiểm tra Google/Facebook Login
   Route: http://localhost:5173/login
   Kết quả: Đăng nhập thành công, avatar upload Cloudinary

6. Kiểm tra rate limiting verify-email (cần Mailtrap)
   Gửi nhiều request GET /api/auth/verify-email?token=invalid
   Kết quả: Sau 5 lần, rate limit chặn (429 Too Many Requests)
