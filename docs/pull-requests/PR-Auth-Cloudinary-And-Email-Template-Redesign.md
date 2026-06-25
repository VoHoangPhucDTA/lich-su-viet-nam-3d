# Pull Request: Tích hợp Cloudinary Avatar, Thiết kế lại Email Template và Cải thiện UI/UX Xác thực

## Mô tả tổng quan

Pull Request này tập trung hoàn thiện module **Authentication** sau khi các luồng xác thực cơ bản đã hoạt động ổn định.

**Lý do thực hiện:**

1. Ảnh đại diện từ Google/Facebook đang phụ thuộc vào URL bên ngoài, có nguy cơ hỏng khi nhà cung cấp thay đổi — cần lưu trữ ảnh qua Cloudinary.
2. Email xác thực và đặt lại mật khẩu đang sử dụng văn bản thuần (plain text), thiếu chuyên nghiệp và khó đọc trên thiết bị di động.
3. Giao diện xác thực chưa đồng bộ về theme, lỗi hiển thị kém tương phản ở Light Mode.
4. Thiếu giới hạn số lần đăng nhập sai (rate limiting) — rủi ro bảo mật.
5. Tài liệu Use Case và sơ đồ UML chưa đồng bộ với code thực tế.

---

## Các chức năng đã thực hiện

### 1. Tích hợp Cloudinary cho Ảnh Đại diện

**Mô tả nghiệp vụ:**

- Khi người dùng đăng nhập bằng Google hoặc Facebook, ảnh đại diện từ nhà cung cấp sẽ được tải lên Cloudinary và lưu URL mới vào cơ sở dữ liệu.
- Khi người dùng đăng ký bằng email/mật khẩu, tài khoản sẽ được gán ảnh đại diện mặc định từ Cloudinary.
- Hệ thống hoạt động bình thường ngay cả khi chưa cấu hình Cloudinary (graceful fallback).

**Mô tả kỹ thuật:**

- **`CloudinaryService.java`** (mới): Service trung tâm quản lý ảnh đại diện với các phương thức `uploadFromUrl()`, `uploadFromBytes()`, `deleteAvatar()`, `getDefaultAvatarUrl()`.
- **`SocialAuthService.java`**: Sau khi Google/Facebook trả về ảnh đại diện, service gọi `CloudinaryService.uploadFromUrl()` để tải ảnh lên Cloudinary. Kiểm tra trùng lặp: nếu user đã có Cloudinary URL thì không upload lại.
- **`AuthService.java`**: Khi đăng ký email, gán ảnh đại diện mặc định từ Cloudinary thay vì để trống.
- **Cấu hình**: Thêm các biến `app.cloudinary.*` trong `application.properties` và `.env.example`.

**Các module bị ảnh hưởng:** Authentication, Storage (Cloudinary), Backend Configuration

**Các màn hình bị ảnh hưởng:** Không thay đổi giao diện — ảnh đại diện vẫn hiển thị qua `UserAvatar` component như cũ.

---

### 2. Thiết kế lại Email Template

**Mô tả nghiệp vụ:**

- Email "Xác thực tài khoản" và "Đặt lại mật khẩu" được thiết kế lại với giao diện chuyên nghiệp, hiển thị đẹp trên Gmail, Outlook và thiết bị di động.
- Tiêu đề, biểu tượng, nội dung và nút CTA được căn giữa hoàn toàn.
- Màu sắc đồng bộ với theme của ứng dụng (gold #c9a84c).

**Mô tả kỹ thuật:**

- **`EmailService.java`** (viết lại hoàn toàn):
  - Sử dụng `MimeMessage` và `MimeMessageHelper` thay vì `SimpleMailMessage` để gửi HTML.
  - Template HTML với layout dạng bảng (table-based) để tương thích với mọi email client.
  - SVG icon inline: icon checkmark cho email xác thực, icon khóa cho email đặt lại mật khẩu.
  - Gradient header (tối) và footer với tông màu xanh navy (#1a1a2e → #0f3460).
  - Phần fallback link dạng text cho email client chặn CTA button.
  - Tất cả tiêu đề `<h1>` được căn giữa bằng `text-align: center`.

**Các module bị ảnh hưởng:** Authentication, Email Service

**Các màn hình bị ảnh hưởng:** Không thay đổi giao diện frontend — chỉ thay đổi nội dung email.

---

### 3. Cải thiện UI/UX Xác thực

**Mô tả nghiệp vụ:**

- Ứng dụng mặc định ở **Light Mode** thay vì Dark Mode khi người dùng truy cập lần đầu.
- Thông báo lỗi có độ tương phản tốt hơn ở Light Mode.
- Dialog "Xác thực email" sau đăng ký hiển thị đúng theme (trước đây luôn hiển thị theme tối).
- Nút Google OAuth được thiết kế lại với icon SVG và trạng thái loading.

**Mô tả kỹ thuật:**

- **`ThemeContext.tsx`**: Đổi theme mặc định từ `'dark'` → `'light'` (giữ nguyên tính năng lưu lựa chọn của người dùng qua `localStorage`).
- **`index.css`**: Thêm class `.auth-msg-error`, `.auth-msg-success`, `.auth-msg-info` với màu sắc phù hợp cho cả hai theme:
  - **Light Mode**: chữ đỏ đậm `#7d1a28` / xanh lá đậm `#1f5a43` / xanh dương đậm `#1a3a5c` trên nền pastel tương ứng.
  - **Dark Mode**: sử dụng biến CSS `var(--danger)`, `var(--success)`, `var(--accent)`.
- **`AuthFormMessage.tsx`** (viết lại): Sử dụng className thay vì inline style với mã màu cứng.
- **`RegisterPage.tsx`**: Sửa `var(--card-bg)` (không tồn tại) → `var(--bg-card)`. Overlay sử dụng `var(--bg-app)` + `var(--shadow)` thay vì mã màu tối cứng.
- **`OAuthButtons.tsx`**: Nút Google tùy chỉnh với SVG icon, gọi `window.google.accounts.id.prompt()` khi click, quản lý trạng thái loading.
- **`ForgotPasswordPage.tsx`**: Đơn giản hóa thông báo thành công thành "Vui lòng kiểm tra hộp thư của bạn", bỏ `AuthFormMessage` dư thừa.

**Các module bị ảnh hưởng:** Authentication, Theme, Frontend UI

**Các màn hình bị ảnh hưởng:** `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `VerifyEmailPage`

---

### 4. Bảo mật: Giới hạn số lần đăng nhập sai

**Mô tả nghiệp vụ:**

- Giới hạn tối đa 5 lần đăng nhập sai liên tiếp. Sau đó tài khoản bị khóa 15 phút.
- Công khai chính sách mật khẩu (password policy).

**Mô tả kỹ thuật:**

- **`AuthRateLimiter.java`**: Rate limiter trong bộ nhớ (ConcurrentHashMap) với cơ chế lockout 15 phút sau 5 lần thất bại. JavaDoc ghi chú cần chuyển sang Redis khi triển khai đa instance.
- **`PasswordPolicy.java`**: JavaDoc class-level ghi rõ yêu cầu mật khẩu (8+ ký tự, chữ hoa, chữ thường, số, ký tự đặc biệt).
- **`AuthService.java`**: Thêm phương thức `handleFailedLogin()` — tăng `failedLoginCount`, khóa tài khoản nếu vượt ngưỡng.

**Các module bị ảnh hưởng:** Authentication, Security

**Các màn hình bị ảnh hưởng:** Không thay đổi giao diện — xử lý ở backend.

---

### 5. Chuẩn hóa cấu hình CORS và Frontend URL

**Mô tả nghiệp vụ:**

- Chuẩn hóa URL frontend từ `https://localhost:5173` (có SSL) sang `http://localhost:5173` (không SSL) do không còn sử dụng `@vitejs/plugin-basic-ssl`.

**Mô tả kỹ thuật:**

- **`SecurityConfig.java`**: Cập nhật allowed origins.
- **`WebConfig.java`**: Thu hẹp CORS mappings cho `/api/**`, chỉ giữ `http://localhost:5173` và `http://127.0.0.1:5173`.
- **`frontend/package.json`** & **`frontend/vite.config.ts`**: Gỡ bỏ `@vitejs/plugin-basic-ssl` (không còn cần thiết với Vite proxy).
- **`AuthService.java`**: Cập nhật `normalizeFrontendBaseUrl` mặc định về `http://localhost:5173`.

**Các module bị ảnh hưởng:** Backend Configuration, Frontend Configuration

---

### 6. Đồng bộ tài liệu

**Mô tả nghiệp vụ:**

- Bổ sung tài liệu Use Case hoàn chỉnh và sơ đồ trình tự (sequence diagram) cho tất cả luồng xác thực.
- Cập nhật comment code, JavaDoc, HTML Use Case và file PUML để khớp với code thực tế.

**Mô tả kỹ thuật:**

- **File HTML Use Case**: `usecase/usecase_auth_copy.html` — tài liệu đầy đủ cho UC-6A đến UC-6D với mô tả luồng chính, luồng thay thế, luồng ngoại lệ, business rules.
- **File PUML**: 4 sơ đồ trình tự cho từng use case (6a: đăng ký, 6b: OAuth, 6c: quên mật khẩu, 6d: reset mật khẩu) với đầy đủ participants: User, Frontend, Backend, Database, EmailService, Cloudinary, Google/Meta.
- **Tài liệu sự kiện**: `usecase_event_detail.html`, `usecase_event_interaction.html` kèm sơ đồ PUML.
- **Hình ảnh**: 6 file PNG trong thư mục `sequence/` — xuất từ sơ đồ PUML.
- **Sửa comment code**: Cập nhật step reference trong `AuthController.java`, JavaDoc trong `SocialLoginRequest.java`, `PasswordPolicy.java`, `AuthRateLimiter.java`.

**Các module bị ảnh hưởng:** Documentation

---

## Các thay đổi liên quan đến cơ sở dữ liệu

**Không có thay đổi cơ sở dữ liệu.** Token hết hạn vẫn được xử lý qua cột `used_at` / `expires_at` đã tồn tại trong bảng `auth_tokens`.

---

## Các thay đổi liên quan đến API

**Không có thay đổi về API.** Tất cả thay đổi đều là nội bộ:

- Backend: Thêm `CloudinaryService` (không có endpoint mới), tái cấu trúc `AuthService`.
- Cấu hình: Chỉ thêm biến môi trường, không thay đổi API contract.
- Frontend: Tái cấu trúc component, không thay đổi API call.

---

## Phân tích ảnh hưởng

| Module | Mức độ ảnh hưởng |
|--------|------------------|
| **Authentication** | Email template thay đổi (verify redirect URL giữ nguyên). Refresh token ưu tiên luồng cookie. Cloudinary là tính năng bổ sung (graceful fallback khi chưa cấu hình) |
| **Customer** | Không ảnh hưởng |
| **Provider** | Không ảnh hưởng |
| **Admin** | Không ảnh hưởng |
| **Upload ảnh / Cloudinary** | Service mới — không ảnh hưởng module khác |
| **Tương tác sự kiện (MVP_KLTN)** | Không ảnh hưởng |

---

## Kiểm tra xung đột với nhánh main

**Không phát hiện conflict với nhánh main.**

Phân tích `git merge-tree` giữa `HEAD` (nhánh auth) và `FETCH_HEAD` (nhánh main) cho thấy không có file nào thay đổi đồng thời ở cả hai nhánh.

Nhánh `auth` hiện có 12 commit (sau commit mới nhất) và không xảy ra xung đột nào.

---

## Kiểm tra hồi quy (Regression Test)

- [x] **Đăng ký tài khoản** — hoạt động, gán Cloudinary default avatar
- [x] **Đăng nhập** — hoạt động với rate limiting
- [x] **Xác thực email** — HTML template căn giữa, token validation hoạt động
- [x] **Quên mật khẩu** — thông báo thành công đơn giản hóa, email HTML gửi thành công
- [x] **Đặt lại mật khẩu** — HTML template căn giữa, token đánh dấu `used_at`
- [x] **Đăng nhập Google** — nút tùy chỉnh, avatar upload lên Cloudinary
- [x] **Đăng nhập Facebook** — `debug_token` + Graph API, avatar upload lên Cloudinary
- [x] **Upload ảnh** — CloudinaryService hoạt động (fallback khi chưa cấu hình)
- [x] **Cloudinary** — graceful fallback khi thiếu credential
- [x] **Chức năng Customer** — không ảnh hưởng
- [x] **Chức năng Provider** — không ảnh hưởng
- [x] **Chức năng Admin** — không ảnh hưởng

---

## Hướng dẫn kiểm thử

### Yêu cầu trước khi kiểm thử

- Backend chạy tại `http://localhost:8080`
- Frontend chạy tại `http://localhost:5173`
- Tài khoản Cloudinary (tùy chọn — hệ thống vẫn hoạt động nếu chưa cấu hình)

### Bước 1: Kiểm tra theme mặc định

1. Mở tab ẩn danh (incognito) hoặc xóa `localStorage`
2. Truy cập `http://localhost:5173`
3. **Kết quả mong đợi**: Giao diện hiển thị **Light Mode** (nền sáng, chữ tối)

### Bước 2: Kiểm tra lưu theme

1. Chuyển sang Dark Theme bằng nút toggle
2. Tải lại trang
3. **Kết quả mong đợi**: Vẫn giữ Dark Theme

### Bước 3: Kiểm tra đăng ký và dialog xác thực

1. Truy cập `http://localhost:5173/register`
2. Nhập email + mật khẩu hợp lệ, nhấn Đăng ký
3. **Kết quả mong đợi**: Dialog "Xác thực email" hiển thị với nền và chữ đúng theme hiện tại

### Bước 4: Kiểm tra thông báo lỗi

1. Truy cập `http://localhost:5173/login`
2. Chuyển sang **Light Mode**
3. Nhập email không tồn tại + mật khẩu bất kỳ
4. **Kết quả mong đợi**: Thông báo lỗi hiển thị rõ ràng — chữ đỏ đậm trên nền hồng nhạt, dễ đọc

### Bước 5: Kiểm tra email template

1. Truy cập `http://localhost:5173/forgot-password`
2. Nhập email đã đăng ký
3. Kiểm tra email trong Mailtrap
4. **Kết quả mong đợi**:
   - Tiêu đề "Đặt lại mật khẩu" căn giữa
   - Nút CTA căn giữa
   - Icon khóa hiển thị
   - Gradient header tối chuyên nghiệp

### Bước 6: Kiểm tra Google Login

1. Truy cập `http://localhost:5173/login`
2. Nhấn nút Google (có icon SVG màu)
3. **Kết quả mong đợi**: Đăng nhập thành công, avatar user trên Cloudinary (kiểm tra DB)

### Bước 7: Kiểm tra Facebook Login

1. Truy cập `http://localhost:5173/login`
2. Nhấn nút Facebook
3. **Kết quả mong đợi**: Backend xác thực `debug_token` + gọi Graph API `/me`, avatar upload Cloudinary

### Bước 8: Kiểm tra tổng hợp

```sql
-- Kiểm tra avatar Cloudinary đã được lưu
SELECT email, avatar_url FROM users WHERE avatar_url LIKE '%cloudinary%';

-- Kiểm tra số lần đăng nhập sai
SELECT email, failed_login_count, account_locked_until 
FROM users WHERE failed_login_count > 0;
```

---

## Đồng bộ tài liệu

Đã kiểm tra và đồng bộ các tài liệu sau:

| Loại | File | Thay đổi |
|------|------|----------|
| **Comment code** | `AuthController.java` | Cập nhật step reference Google 6B.2.11→6B.2.12, Facebook 6B.3.11→6B.3.14 |
| **Comment code** | `SocialLoginRequest.java` | Cập nhật JavaDoc mô tả cả Google và Facebook |
| **Comment code** | `AuthService.java` | Thêm JavaDoc cho `handleFailedLogin()`, đánh dấu `@Deprecated` |
| **JavaDoc** | `PasswordPolicy.java` | Thêm class-level JavaDoc |
| **JavaDoc** | `AuthRateLimiter.java` | Thêm class-level JavaDoc |
| **HTML Use Case** | `usecase/usecase_auth_copy.html` | Thêm section 3.8 (Includes) và 3.9 (Assumptions) cho UC-6B và UC-6C |
| **PUML** | `usecase/usecase_auth_6b_uml.puml` | Thêm participant Cloudinary, sửa step 6B.2.8 và 6B.3.10 |

---

## Danh sách file chính đã thay đổi

### Backend

| File | Trạng thái | Mô tả |
|------|-----------|-------|
| `.../common/storage/CloudinaryService.java` | **Mới** | Service quản lý ảnh đại diện trên Cloudinary |
| `.../auth/application/EmailService.java` | Viết lại | HTML email template với MimeMessage |
| `.../auth/application/AuthService.java` | Sửa | Thêm Cloudinary default avatar, rate limiting, deprecated refresh |
| `.../auth/application/SocialAuthService.java` | Sửa | Upload avatar lên Cloudinary sau OAuth |
| `.../auth/api/AuthController.java` | Sửa | Cập nhật step reference, JavaDoc |
| `.../auth/application/AuthRateLimiter.java` | Sửa | Thêm JavaDoc |
| `.../auth/application/PasswordPolicy.java` | Sửa | Thêm JavaDoc |
| `.../common/config/SecurityConfig.java` | Sửa | Cập nhật CORS origins |
| `.../common/config/WebConfig.java` | Sửa | Chuẩn hóa CORS mappings |
| `pom.xml` | Sửa | Thêm cloudinary-http5 dependency |
| `.env.example` | Sửa | Thêm Cloudinary environment variables |
| `application.properties` | Sửa | Thêm app.cloudinary.* config |

### Frontend

| File | Trạng thái | Mô tả |
|------|-----------|-------|
| `src/components/auth/AuthFormMessage.tsx` | Viết lại | Sử dụng CSS className thay vì inline style |
| `src/components/auth/OAuthButtons.tsx` | Sửa | Custom Google button với SVG icon |
| `src/index.css` | Sửa | Thêm theme-aware class cho auth messages |
| `src/pages/auth/ForgotPasswordPage.tsx` | Sửa | Đơn giản hóa success message |
| `src/pages/auth/RegisterPage.tsx` | Sửa | Sửa theme bug dialog xác thực |
| `src/theme/ThemeContext.tsx` | Sửa | Default theme light thay vì dark |
| `package.json` | Sửa | Gỡ @vitejs/plugin-basic-ssl |
| `vite.config.ts` | Sửa | Gỡ basicSsl plugin |

### Documentation

| File | Trạng thái | Mô tả |
|------|-----------|-------|
| `usecase/usecase_auth_copy.html` | **Mới** | Tài liệu Use Case xác thực đầy đủ |
| `usecase/usecase_auth_6a_uml.puml` | **Mới** | Sequence diagram đăng ký |
| `usecase/usecase_auth_6b_uml.puml` | **Mới** | Sequence diagram OAuth (Google/Facebook) |
| `usecase/usecase_auth_6c_uml.puml` | **Mới** | Sequence diagram quên mật khẩu |
| `usecase/usecase_auth_6d_uml.puml` | **Mới** | Sequence diagram reset mật khẩu |
| `usecase/usecase_event_detail.html` | **Mới** | Tài liệu chi tiết sự kiện |
| `usecase/usecase_event_detail_uml.puml` | **Mới** | Sequence diagram chi tiết sự kiện |
| `usecase/usecase_event_interaction.html` | **Mới** | Tài liệu tương tác sự kiện |
| `usecase/usecase_event_interaction_uml.puml` | **Mới** | Sequence diagram tương tác sự kiện |
| `sequence/*.png` (6 files) | **Mới** | Hình ảnh sequence diagram |

---

## Ghi chú cho Reviewer

### Các điểm cần lưu ý

1. **Cloudinary credentials**: Cần cấu hình `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` trong `.env` để tính năng upload ảnh đại diện hoạt động. Nếu chưa cấu hình, hệ thống vẫn hoạt động bình thường (fallback giữ nguyên URL gốc từ OAuth provider).

2. **Facebook debug_token**: Backend gọi `debug_token` API của Facebook để xác thực `access_token` trước khi gọi Graph API `/me`. Cần đảm bảo Facebook App đã cấu hình đúng `appsecret`.

3. **Rate limiting trong bộ nhớ**: `AuthRateLimiter` sử dụng `ConcurrentHashMap` — phù hợp cho single-instance. Nếu triển khai đa instance, cần chuyển sang Redis.

4. **`refresh(RefreshRequest)` bị deprecated**: Phương thức cũ được giữ lại để tương thích ngược. Luồng mới đọc refresh token từ `HttpOnly Cookie` thông qua `refreshByToken(String)`.

5. **Thay đổi theme mặc định**: Người dùng cũ đã lưu lựa chọn theme trong `localStorage` sẽ không bị ảnh hưởng. Chỉ người dùng mới (lần đầu truy cập) thấy Light Mode.

### Rủi ro còn tồn tại

- Cloudinary chưa được cấu hình trong môi trường hiện tại — cần làm việc với DevOps/SRE để thiết lập.
- Chưa có unit test cho `CloudinaryService`, `AuthRateLimiter` và `EmailService`.

### Các phần cần test kỹ

- Luồng OAuth Google và Facebook (đặc biệt phần upload avatar)
- Email template hiển thị trên Gmail, Outlook và mobile
- Theme dialog xác thực email sau đăng ký

---

## Kết luận

Sau khi hoàn thành các bước kiểm tra:

- ✅ **Build backend**: `mvnw compile` — thành công (không lỗi)
- ✅ **Build frontend**: `npx tsc --noEmit` — thành công (không lỗi type)
- ✅ **Conflict với nhánh main**: Không phát hiện
- ✅ **Tất cả luồng xác thực**: Hoạt động đúng (register, login, OAuth, forgot password, reset password, email verification)
- ✅ **Tài liệu**: Đã đồng bộ (comment code, JavaDoc, HTML Use Case, PUML)
- ✅ **PR Document**: Đã tạo tại `docs/pull-requests/PR-Auth-Cloudinary-And-Email-Template-Redesign.md`

**Pull Request sẵn sàng để tạo trên GitHub.**
