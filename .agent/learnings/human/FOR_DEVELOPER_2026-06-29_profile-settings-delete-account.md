# 🧠 Profile Settings — Developer Learning Notes

> Viết cho developer hiểu chuyện gì đã xảy ra, tại sao, và học được gì.
> Ngày: 2026-06-29

---

## 1. Approach & Reasoning

### Điểm xuất phát

Khi bắt đầu, `profile` branch đã merge `main` thành công. Build chạy ngon lành. Nhưng có mấy cái "ôm" (known issues):

1. **`window.confirm()` cho delete account** — cái hộp thoại trình duyệt mặc định xấu òm, không theo design system
2. **Emoji keys trong icon map** — kiểu `'💰'` làm key cho React component. Không chết ai nhưng nhìn chuyên nghiệp thì không
3. **Hardcoded colors trong ProgressChart** — `'#8b1e1e'` thay vì `var(--accent)`. Có CSS variables rồi mà không dùng
4. **`ProfilePlaceholderPage.tsx`** — file chết, không ai import
5. **Flyway checksum mismatch** — V11 migration bị lỗi checksum, backend không start được

Cách tiếp cận: **fix từ dễ đến khó**, từ frontend đến backend, verify build sau mỗi step.

---

## 2. Roads Not Taken

### Cho custom dialog: Tại sao không dùng thư viện?

**Alternative 1: `react-modal` hoặc `headless-ui` Dialog**
- *Lý do loại*: Project đã có design system riêng (stone/red-900/amber), thư viện generic sẽ không matching được style. Thêm dependency cho 1 cái dialog thì không đáng.
- *Cái gì đã đúng*: Đúng là thư viện nhanh hơn (khoảng 15 dòng code so với 150). Nhưng customize lại mất công hơn tự viết.

**Alternative 2: Dùng `window.confirm()` nhưng styled (alert.js hacks)**
- *Lý do loại*: `window.confirm()` là blocking synchronous API của browser. Không thể style được. Không thể có loading state. Không thể có animation.
- *Bài học*: Browser native dialogs (`alert`, `confirm`, `prompt`) là synchronous blocking — nghĩa là JS execution bị đóng băng khi dialog mở. Điều này vi phạm React's declarative paradigm hoàn toàn.

### Cho Flyway checksum: Tại sao không set `spring.flyway.repair-on-migrate=true`?

- *Lý do loại*: `repair-on-migrate` là **tính năng trả phí** của Flyway Teams/Enterprise. Community Edition không có.
- *Bài học*: Luôn kiểm tra giấy phép trước khi dựa vào một tính năng "có vẻ như nên có". Flyway Community khá restrictive về repair/undo features.

### Cho soft delete: Tại sao không hard delete?

- *Lý do loại*: Hard delete mất dữ liệu vĩnh viễn — không thể undo, không thể admin recovery, không thể analytics historical data. Soft delete với `status='deleted'` cho phép:
  - Admin reactivate account
  - Thống kê số lượng tài khoản đã xoá
  - GDPR compliance (có thể xoá thật sau 30 ngày qua batch job)
- *Tradeoff*: Phải filter `status != 'deleted'` ở mọi query → phức tạp hơn, dễ quên.

---

## 3. How Things Connect

### Flow tổng thể của profile settings:

```
ProfileSettingsPage.tsx
├── Profile Info Form ──────────→ updateProfile() → PATCH /api/auth/me/update
├── Change Password Form ──────→ changePassword() → POST /api/auth/change-password
├── Current Session Section ───→ logout() → POST /api/auth/logout → clear cookies
└── Danger Zone ───────────────→ deleteAccount()
    └── DeleteAccountDialog (custom modal)
        ├── Escape key → onCancel
        ├── Click overlay → onCancel
        ├── Click "Hủy" → onCancel
        └── Click "Xác nhận xóa" → deleteAccount() → POST /api/auth/delete-account
            ├── Backend: set status='deleted' + delete Cloudinary avatar + clear cookies
            └── Frontend: clear stored user + navigate to /login
```

### Luồng dữ liệu của delete account (end-to-end):

```
[Frontend]                          [Backend]                         [Database/Cloudinary]
   │                                  │                                    │
   ├─ POST /api/auth/delete-account ─→│                                    │
   │                                  ├─ find user by principal            │
   │                                  ├─ check status == ACTIVE            │
   │                                  ├─ set status = 'deleted' ──────────→│ users.status
   │                                  ├─ if avatarUrl has cloudinary.com ─→│ Cloudinary delete
   │                                  ├─ clear auth cookies (maxAge=0)     │
   │                                  └─ return MessageDto ───────────────→│
   ├─ clearStoredUser()               │                                    │
   ├─ setCurrentUser(null)            │                                    │
   └─ navigate('/login')              │                                    │
```

---

## 4. Tools & Methods

### Tại sao dùng color-mix() thay vì rgba()?

Khi làm việc với CSS variables (`var(--accent)`) và cần alpha channel:
- **`rgba()`** — không hoạt động với CSS var vì `rgba(var(--accent), 0.5)` chỉ nhận `rgb(r,g,b)` values, không nhận hex hay named colors
- **`#8b1e1eaa`** — 8-digit hex với alpha, hoạt động với hardcoded values nhưng KHÔNG với `var()` vì `var(--accent)aa` là syntax error
- **`color-mix()`** — hoạt động với mọi color type kể cả `var()`. `color-mix(in srgb, var(--accent) 67%, transparent)` = mix 67% accent color với 33% transparent

Bài học: **`color-mix()` là CSS function duy nhất cho phép alpha manipulation với CSS variables** mà không cần preprocessor.

### Tại sao dùng Flyway migration thay vì JPA auto-update?

- **Flyway**: Migration script rõ ràng, version controlled, có thể review, rollback script có thể viết tay
- **JPA `spring.jpa.hibernate.ddl-auto=update`**: Tiện nhưng nguy hiểm trong production — có thể drop column, thay đổi type mà không báo trước
- Quyết định: Flyway là chuẩn production. JPA auto-update chỉ dùng cho local dev.

---

## 5. Tradeoffs

| Decision | Ưu điểm | Nhược điểm |
|---|---|---|
| **Custom dialog** thay vì thư viện | Matching design system chính xác, không dependency | 150 dòng code, phải tự quản lý focus trap, keyboard events |
| **color-mix()** thay vì rgba() | Hoạt động với CSS var, không cần biết trước hex value | `color-mix()` không support trong Chrome <111, Safari <16.2 |
| **Soft delete** thay vì hard delete | Có thể admin recovery, thống kê được | Phải filter everywhere, tổn dung lượng DB |
| **CSS variables** trong inline styles | Theme consistency, dễ维护 | Không dùng được `${color}aa` alpha trick — phải color-mix |

---

## 6. Mistakes & Dead Ends

### 🐛 Bug #1: `var(--accent)aa` không phải CSS hợp lệ

Đây là bug tinh vi nhất trong session này. Look completely valid:
```jsx
background: `linear-gradient(180deg, ${color} 0%, ${color}aa 100%)`
```
Với `color = "var(--accent)"`, kết quả:
```
linear-gradient(180deg, var(--accent) 0%, var(--accent)aa 100%)
```
**Browser không parse được `var(--accent)aa`**. Nó tưởng `aa` là part của CSS function call, không phải alpha hex. Gradient silently fails — background sẽ là transparent hoặc fallback color.

**Cách tìm ra**: Code reviewer (Nit Pick Nick) phát hiện. Manual QA có thể không thấy vì gradient vẫn "có vẻ hiển thị" ở một số chỗ.

**Cách fix**: `color-mix(in srgb, ${color} 67%, transparent)`

### 🐛 Bug #2: Double bullet trong dialog

Classic copy-paste bug:
```tsx
<li className="list-disc">• Lịch sử học tập...</li>
```
`list-disc` thêm CSS bullet + `•` là text bullet = 2 bullets.

**Root cause**: Ai đó thêm `list-disc` class nhưng quên xoá hardcoded bullet character. Dễ miss vì nhìn trên màn hình "cũng giống bullet" — không ai để ý.

### 🐛 Bug #3: Flyway checksum mismatch

V11 migration được apply với checksum A, sau đó file local thay đổi (có thể do edit/rename/copy). Flyway từ chối start vì bảo mật — không cho chạy migration đã thay đổi sau khi apply.

**Lesson**: Không bao giờ sửa migration file đã được commit và apply xuống DB. Luôn tạo migration mới.

---

## 7. Future Pitfalls

### ⚠️ Nếu thêm status mới vào UserStatus enum

Nhớ:
1. Thêm vào `UserStatus.java` enum ✅
2. Thêm vào MySQL ENUM qua Flyway migration (không quên!) ✅
3. Update tất cả `if/else` check status trong codebase — đặc biệt là `login()`, `me()`, `updateProfile()`, `refreshByToken()`, `principalFromAccessToken()`
4. Kiểm tra migration đã được apply chưa trước khi deploy

### ⚠️ Khi dùng CSS variables trong inline styles

Không thể dùng `${varName}aa` (alpha hex suffix). Luôn dùng `color-mix()` hoặc define sẵn biến `--accent-50`, `--accent-30` trong CSS.

### ⚠️ Khi custom dialog có destructive action

- Luôn có `isDeleting` state riêng — không dùng chung loading state
- Disable tất cả close mechanisms khi đang xoá: Escape key, X button, overlay click
- `finally` block luôn chạy — kể cả khi API throw — để reset state

---

## 8. Expert vs Beginner

| Beginner làm | Expert làm |
|---|---|
| `window.confirm()` cho delete confirmation | Custom modal với loading state, keyboard trap, body scroll lock |
| `${color}aa` với CSS variables | `color-mix(in srgb, ${color} 67%, transparent)` |
| Sửa trực tiếp file V11 migration đã apply | Tạo V12 migration mới, hoặc run `flyway:repair` |
| `<li className="list-disc">• text</li>` | `<ul className="list-disc"><li>text</li></ul>` |
| `catch (e)` và show `e.message` | `catch (e: unknown)` và check `e instanceof Error` |
| Dùng loading state chung cho mọi thứ | `deleting` state riêng, `pwSaving` riêng, `saving` riêng |

---

## 9. Transferable Lessons

### Lesson 1: CSS variables + alpha = đau đầu

Bất kỳ project nào dùng CSS variables + inline styles đều gặp vấn đề này. Giải pháp:
- Define sẵn alpha variant variables trong CSS: `--accent-50`, `--accent-20`
- Hoặc dùng `color-mix()` (2013+ browsers)
- Hoặc preprocess với SCSS/LESS mixins

Không có giải pháp hoàn hảo — mỗi cái có tradeoff riêng.

### Lesson 2: Dialog accessibility không khó như tưởng tượng

Custom dialog cần 4 thứ để accessible:
1. `role="dialog"` + `aria-modal="true"` → screen reader hiểu đây là modal
2. Escape key to close → keyboard user không bị kẹt
3. Focus trap → focus không thoát ra ngoài dialog
4. Body scroll lock → background không scroll khi dialog mở

Chỉ cần 4 `useEffect` hooks là đủ. Không cần thư viện.

### Lesson 3: Soft delete với ENUM thì nhớ migration

Khi thêm enum value mới cho column là MySQL ENUM, luôn cần `ALTER TABLE ... MODIFY COLUMN`. JPA/Hibernate auto-DDL sẽ không làm điều này cho bạn vì Hibernate không map Java enum sang MySQL ENUM — nó map thành VARCHAR.

### Lesson 4: Flyway migration là immutable

Migration file, một khi đã apply xuống database, là **read-only**. Không sửa, không xoá. Nếu cần thay đổi → tạo migration mới. Quên rule này → checksum mismatch → cả team không start được app.
