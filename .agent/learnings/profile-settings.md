# Profile Settings

> Tổng hợp kiến thức về tính năng cài đặt hồ sơ người dùng (profile settings) trong dự án Lịch Sử Việt Nam 3D.
> Cập nhật lần cuối: 2026-06-29

---

## Architecture

### Profile Settings Page Architecture
- **Ngày**: 2026-06-29
- **Chi tiết**: `ProfileSettingsPage.tsx` sử dụng compound component pattern: `FormField`, `SelectField`, `Card`, `CardTitle`, `Toast` là các component local, không re-export. State được quản lý tập trung trong component chính với các state riêng cho từng section (profile, password, delete).
- **Files liên quan**: `frontend/src/pages/profile/ProfileSettingsPage.tsx`

### Delete Account Confirmation Dialog
- **Ngày**: 2026-06-29
- **Chi tiết**: Custom modal dialog thay thế `window.confirm()` với backdrop blur, `aria-modal`, Escape key handler, body scroll lock, và disabled state khi đang xoá. Design theo stone/red-900/amber palette từ CoiNguonPage và lsvn3d.
- **Files liên quan**: `frontend/src/components/profile/DeleteAccountDialog.tsx`

### Soft Delete Pattern
- **Ngày**: 2026-06-29
- **Chi tiết**: Xoá tài khoản dùng soft delete: set `users.status = 'deleted'` thay vì xóa record khỏi database. Cần thêm `'deleted'` vào MySQL ENUM qua Flyway migration. Avatar trên Cloudinary được xoá song song.
- **Files liên quan**: `backend/src/main/java/.../AuthService.java`, `backend/src/main/resources/db/migration/V11__add_deleted_status.sql`, `backend/src/main/java/.../UserStatus.java`

### HttpOnly Cookie Architecture
- **Ngày**: 2026-06-29
- **Chi tiết**: Auth dùng HttpOnly Cookie (không localStorage cho token). `access_token` path="/" (1h), `refresh_token` path="/api/auth/refresh" (7 ngày). Frontend dùng `credentials: 'include'` để browser tự động đính kèm cookie. Backend set/clear cookie qua `ResponseCookie` trong `AuthController`.
- **Files liên quan**: `frontend/src/services/apiClient.ts`, `backend/src/main/java/.../AuthController.java`

---

## Bugs & Solutions

### MySQL ENUM không chấp nhận 'deleted'
- **Ngày**: 2026-06-29
- **Vấn đề**: 500 error khi delete account vì `status` column là `ENUM('active','disabled','pending')` không chấp nhận `'deleted'`
- **Root cause**: Migration `V1__users_roles.sql` định nghĩa ENUM cứng, thiếu giá trị `'deleted'`
- **Fix**: Tạo `V11__add_deleted_status.sql` với `ALTER TABLE users MODIFY COLUMN status ENUM('active','disabled','pending','deleted')`
- **Files liên quan**: `V11__add_deleted_status.sql`, `V1__users_roles.sql`

### Flyway Checksum Mismatch
- **Ngày**: 2026-06-29
- **Vấn đề**: Backend không start được vì `Migration checksum mismatch for migration version 11`
- **Root cause**: File V11 đã được apply xuống DB, nhưng checksum file local khác với checksum trong DB
- **Fix**: Run `flyway:repair` hoặc xoá row trong `flyway_schema_history` để Flyway re-apply
- **Files liên quan**: `V11__add_deleted_status.sql`

### CSS var() không hoạt động với alpha hex suffix
- **Ngày**: 2026-06-29
- **Vấn đề**: `var(--accent)aa` là CSS không hợp lệ — browser không thể append `aa` vào `var()` result
- **Root cause**: `\`background: linear-gradient(180deg, ${color} 0%, ${color}aa 100%)\`` với `color=var(--accent)` sinh ra `var(--accent)aa`
- **Fix**: Dùng CSS `color-mix(in srgb, ${color} 67%, transparent)` thay vì `${color}aa`
- **Files liên quan**: `frontend/src/components/profile/ProgressChart.tsx`

### Double bullets trong dialog list
- **Ngày**: 2026-06-29
- **Vấn đề**: List items hiển thị 2 bullet: 1 từ `list-disc` CSS class, 1 từ hardcoded `•`
- **Root cause**: `<li className="list-disc">• text</li>` — cả CSS và text đều render bullet
- **Fix**: Chuyển `list-disc` lên `<ul>` và xoá hardcoded `•` khỏi `<li>` text
- **Files liên quan**: `frontend/src/components/profile/DeleteAccountDialog.tsx`

---

## How-To

### Cách thêm một custom confirmation dialog
1. Tạo component dialog với props: `isOpen`, `isDeleting`, `onConfirm`, `onCancel`
2. Dùng `useEffect` cho Escape key, body scroll lock, focus trap
3. Render với `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
4. Click overlay để close: `if (e.target === e.currentTarget && !isDeleting) onCancel()`
5. Ở page component, quản lý state: `showDeleteDialog` + `deleting` flags
6. `handleConfirmDelete`: set `deleting=true` → call API → finally set `deleting=false`
- **Files liên quan**: `DeleteAccountDialog.tsx`, `ProfileSettingsPage.tsx`

### Cách thêm một Flyway migration
1. Tạo file `V{next_version}__{description}.sql` trong `backend/src/main/resources/db/migration/`
2. Viết SQL idempotent (có thể chạy lại)
3. Restart backend — Flyway auto-apply
4. Nếu checksum mismatch: chạy `flyway:repair` hoặc xoá row trong `flyway_schema_history`
- **Files liên quan**: `V11__add_deleted_status.sql`

---

## Patterns

### Error boundary pattern cho async operations
- **Ngày**: 2026-06-29
- **Chi tiết**: Dùng `try/catch/finally` với `catch (e: unknown)` để đảm bảo không throw exception không xử lý. `e instanceof Error ? e.message : 'Có lỗi xảy ra.'` — an toàn vì `catch` có thể bắt non-Error values.
- **Files liên quan**: `ProfileSettingsPage.tsx`

### Loading state pattern cho destructive actions
- **Ngày**: 2026-06-29
- **Chi tiết**: Destructive actions (delete account) cần `deleting` flag riêng thay vì dùng chung `loading`. Khi `isDeleting=true`: disable all close buttons (Escape, X, overlay click), hiển thị spinner, disable cancel button.
- **Files liên quan**: `DeleteAccountDialog.tsx`

### CSS color-mix() cho alpha với CSS variables
- **Ngày**: 2026-06-29
- **Chi tiết**: Khi cần alpha channel với CSS `var()`, không dùng `${color}aa` (không hoạt động). Dùng `color-mix(in srgb, var(--accent) 67%, transparent)` thay thế.
- **Browser support**: Chrome 111+, Firefox 113+, Safari 16.2+
- **Files liên quan**: `ProgressChart.tsx`
