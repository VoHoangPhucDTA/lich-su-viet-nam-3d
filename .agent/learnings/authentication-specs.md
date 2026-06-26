# Authentication Specifications

> Tổng hợp kiến thức về đặc tả Usecase và tài liệu hóa chức năng Authentication (Đăng nhập, Đăng ký, Quên mật khẩu, Đăng xuất) trong dự án.
> Cập nhật lần cuối: 2026-06-25

---

## Architecture

### Kiến trúc tổng thể hệ thống
- **Ngày**: 2026-05-15
- **Chi tiết**: Hệ thống dùng kiến trúc Client-Server kết hợp Microservices. Frontend (ReactJS, CesiumJS cho bản đồ 3D) kết nối Backend (Spring Boot) quản lý MySQL và API ngoài (FPT.AI Text to Speech). AI Service (FastAPI) độc lập dùng RAG & LLM kết nối Vector DB chứa dữ liệu cào từ SGK/Wiki để hỏi đáp.
- **Files liên quan**: `usecase_auth_copy.html`

### Defensive Logout & HttpOnly Cookie Lifecycle
- **Ngày**: 2026-05-17
- **Chi tiết**: Tách riêng UC-6D cho Đăng xuất. Dùng pattern `try/finally` phía client để luôn clear React state (`setCurrentUser(null)`) và `localStorage` bất kể API `/api/auth/logout` có gọi thành công hay gặp lỗi timeout. Phía server, access_token và refresh_token được set `maxAge=0` để vô hiệu hoá Cookie.
- **Files liên quan**: `AuthContext.tsx`, `authService.ts`, `AuthController.java`

### Rate limiting: cần áp dụng cho ALL auth endpoints, kể cả GET
- **Ngày**: 2026-06-25
- **Chi tiết**: Rate limiting ban đầu chỉ áp dụng cho POST endpoints (login, register, forgot-password, OAuth). Endpoint GET `/verify-email` bị bỏ sót, tạo lỗ hổng brute-force token. Fix: thêm `authRateLimiter.check()` cho mọi auth endpoint không phân biệt HTTP method.
- **Files liên quan**: `AuthController.java`

### CloudinaryService: không sinh URL dẫn đến 404
- **Ngày**: 2026-06-25
- **Chi tiết**: `getDefaultAvatarUrl()` có fallback sinh URL Cloudinary cho ảnh chưa tồn tại (404). Thay vào đó, trả về empty string để caller tự quyết định fallback. `AuthService.register()` kiểm tra `!defaultAvatar.isBlank()` trước khi set — nếu empty thì user không có avatar, đó là hành vi an toàn.
- **Files liên quan**: `CloudinaryService.java`, `AuthService.java`

---

## Bugs & Solutions

### Tái cấu trúc đặc tả Use Case quá lớn
- **Ngày**: 2026-05-17
- **Vấn đề**: Usecase 6 (Xác thực tài khoản) ban đầu quá lớn và phức tạp để viết đặc tả.
- **Root cause**: Gom nhóm nhiều tính năng riêng biệt vào chung 1 quy trình khiến mô tả luồng (flow) trở nên rối rắm.
- **Fix**: Tách Usecase 6 thành 4 usecase con độc lập: 6A (Đăng ký), 6B (Đăng nhập), 6C (Quên mật khẩu), và 6D (Đăng xuất). Phân tách rõ ràng flow của Client Rendering thay vì vẽ mũi tên trả về thẳng Actor (Người dùng).
- **Files liên quan**: `usecase_auth_copy.html`

### Lỗi 400 Validation Error khi Refresh Token
- **Ngày**: 2026-05-17
- **Vấn đề**: Gọi API `/api/auth/refresh` bị lỗi HTTP 400 Bad Request liên tục dù token vẫn còn hạn.
- **Root cause**: API yêu cầu `@RequestBody RefreshRequest` có annotation `@NotBlank`, trong khi frontend gửi request không có body (do refresh_token được tự động gửi qua HttpOnly Cookie).
- **Fix**: Xóa class `RefreshRequest` và đổi Controller sang đọc trực tiếp token từ `HttpServletRequest` qua mảng Cookies. Frontend huỷ gửi payload data.
- **Files liên quan**: `AuthController.java`, `apiClient.ts`

### Thiếu rate limiting trên GET /verify-email
- **Ngày**: 2026-06-25
- **Vấn đề**: Endpoint `/api/auth/verify-email` (GET) không có rate limiting, có thể bị brute-force token xác thực.
- **Root cause**: Rate limiting chỉ được thêm khi implement các POST endpoints, GET endpoint bị bỏ sót trong quá trình review.
- **Fix**: Thêm `authRateLimiter.check(rateKey(servletRequest, "verify-email", ""))` vào endpoint, dùng IP-based key (không có email trong request).
- **Files liên quan**: `AuthController.java`

### Hardcoded rgba trong ForgotPasswordPage success state
- **Ngày**: 2026-06-25
- **Vấn đề**: ForgotPasswordPage dùng hardcoded `rgba(47,122,87,0.12)` cho background success card, không nhất quán với CSS variables.
- **Root cause**: Success state được implement riêng (không dùng AuthFormMessage component) để có layout đặc thù (icon Inbox, email highlight). Hardcoded colors không bị phát hiện trong code review ban đầu.
- **Fix**: Đổi sang dùng CSS class `auth-msg-success` đã tồn tại, xóa hardcoded rgba.
- **Files liên quan**: `ForgotPasswordPage.tsx`, `index.css`

---

## How-To

### Trích xuất tài liệu chuẩn từ AI sang MS Word
- **Ngày**: 2026-05-15
- **Bước thực hiện**:
  1. Tạo file `.html` để tránh lỗi bảo mật khi tạo trực tiếp `.doc`.
  2. Dùng CSS inline (font Times New Roman, border tables) để chuẩn hóa theo template Đồ án KLTN.
  3. Mở file HTML trên trình duyệt, nhấn Ctrl+A, Ctrl+C và dán thẳng vào MS Word để giữ nguyên định dạng.
- **Files liên quan**: `usecase_auth_copy.html`

### Cách thực hiện code review theo find-bugs workflow
- **Ngày**: 2026-06-25
- **Bước thực hiện**:
  1. Lấy toàn bộ diff: `git diff $(git merge-base HEAD origin/main)..HEAD`
  2. Đọc từng file thay đổi — không bỏ sót file nào.
  3. Map attack surface: xác định input từ user, truy vấn DB, kiểm tra auth, call bên ngoài, thao tác session.
  4. Chạy security checklist cho mọi file (Injection, XSS, Auth, CSRF, Race conditions, v.v.).
  5. Verify từng finding bằng cách đọc context xung quanh, tìm test hiện có.
  6. Liệt kê mọi file đã review và xác nhận đã đọc hoàn toàn.
- **Files liên quan**: Full project

---

## Patterns

### Tracing Requirements (Code to Specification)
- **Ngày**: 2026-05-15
- **Chi tiết**: Đánh dấu comment trong source code với mã số tương ứng trong tài liệu Đặc tả Usecase (Ví dụ: `// Bước 6A.1.4: AuthController.java: gọi AuthService.java...`). Pattern này giúp liên kết chặt chẽ tài liệu (Word), biểu đồ Sequence (PlantUML) và thực tế triển khai Code.
- **Files liên quan**: `AuthController.java`, `AuthService.java`, `authService.ts`, `ResetPasswordPage.tsx`

### Self-Message UI Component Updates (PlantUML)
- **Ngày**: 2026-05-17
- **Chi tiết**: Trong PlantUML, khi hệ thống thực hiện thao tác render hoặc đổi state hiển thị cho User, không dùng mũi tên gọi ngược lại User (`UI --> U : Hiển thị...`) vì sẽ gây rối và sai nguyên lý "thông báo không đập vào mặt". Thay vào đó dùng vòng lặp self-message trên Component (`UI -> UI : Toast / Redirect`).
- **Files liên quan**: `usecase_auth_6a_uml.puml`, v.v...

### Luôn kiểm tra rate limiting trên ALL endpoints
- **Ngày**: 2026-06-25
- **Chi tiết**: Rate limiting cần được kiểm tra trên mọi endpoint auth, bao gồm cả GET endpoints. Không chỉ POST endpoints mới cần rate limiting — token-based GET endpoints cũng có thể bị brute-force. Khi implement tính năng mới, cần review checklist xem endpoint đó đã có rate limiting chưa.
- **Files liên quan**: `AuthController.java`

### CSS class over inline style cho theme-aware components
- **Ngày**: 2026-06-25
- **Chi tiết**: Khi implement UI component cần hỗ trợ cả Light và Dark theme, ưu tiên dùng CSS class (định nghĩa trong index.css) thay vì inline style với màu cứng. CSS class cho phép theme switching tự động qua `data-theme` attribute. Lucide React icons dùng `currentColor` mặc định — chúng sẽ inherit color từ parent CSS class.
- **Files liên quan**: `ForgotPasswordPage.tsx`, `AuthFormMessage.tsx`, `index.css`
