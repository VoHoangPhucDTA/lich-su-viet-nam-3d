# Pull Request: Auth — Cloudinary Avatar Integration & Email Template Redesign

## Summary

Complete authentication module enhancement adding Cloudinary-powered avatar management for OAuth and email-registered users, alongside a comprehensive email template redesign for professional SaaS-quality verification and password reset emails. Frontend authentication UI is improved with proper theme support, error message contrast, and default light mode.

---

## Features Implemented

### Feature 1: Cloudinary Avatar Integration

**Business Description:**
- Store user profile avatars from Google/Facebook OAuth on Cloudinary instead of relying on external URLs
- Assign a default avatar for email-registered users
- Provide centralized avatar management service

**Technical Description:**
- **`CloudinaryService.java`** (new): Service with `uploadFromUrl()`, `uploadFromBytes()`, `deleteAvatar()`, `getDefaultAvatarUrl()`, and graceful fallback when Cloudinary is not configured
- **`SocialAuthService.java`**: After Google/Facebook returns avatar URL, uploads to Cloudinary and stores the Cloudinary URL — duplicate prevention checks for existing Cloudinary URLs
- **`AuthService.java`**: Email registrations now assign a Cloudinary default avatar
- **Configuration**: Added `app.cloudinary.*` variables in `application.properties` and `.env.example`

**Affected modules:** Auth, Backend Configuration

### Feature 2: Email Template Redesign

**Business Description:**
- Replace plain-text emails with modern, professional HTML email templates
- Ensure proper centering of all email elements (icon, heading, body, CTA button)
- Support Gmail, Outlook, and mobile rendering

**Technical Description:**
- **`EmailService.java`** (rewritten): 
  - HTML templates with inline SVGs (checkmark for verification, lock icon for password reset)
  - Table-based layout for email client compatibility
  - Gold (#c9a84c) design system matching the app theme
  - Dark header + footer gradients
  - Proper `text-align: center` on all centered elements (including headings)
  - MimeMessage + MimeMessageHelper for HTML delivery
  - Fallback link section for email clients that block CTA buttons

**Affected modules:** Auth, Email Service

### Feature 3: Auth UI/UX Improvements

**Business Description:**
- Default to light mode on first visit
- Fix error message contrast in light mode
- Fix verify email dialog theme bug (was ignoring active theme)
- Improve Google OAuth button UX

**Technical Description:**
- **`ThemeContext.tsx`**: Changed default theme from `dark` → `light` (persisted preference still works)
- **`index.css`**: Added `.auth-msg-*` theme-aware CSS classes with proper contrast colors for both themes
- **`AuthFormMessage.tsx`** (redesigned): Uses CSS classNames instead of hardcoded colors
- **`RegisterPage.tsx`**: Fixed `var(--card-bg)` → `var(--bg-card)`, overlay uses `var(--bg-app)` + `var(--shadow)`
- **`OAuthButtons.tsx`**: Custom Google button with SVG icon, proper loading state management via `window.google.accounts.id.prompt()`
- **`ForgotPasswordPage.tsx`**: Simplified success message to "Vui lòng kiểm tra hộp thư của bạn"

**Affected modules:** Auth, Theme, Frontend UI

### Feature 4: Backend Security & Rate Limiting

**Business Description:**
- Add rate limiting for failed login attempts
- Document password policy requirements
- Standardize frontend URL to HTTP (no SSL for local dev)

**Technical Description:**
- **`AuthRateLimiter.java`**: In-memory ConcurrentHashMap rate limiter with 15-minute lockout after 5 failed attempts
- **`PasswordPolicy.java`**: Class-level JavaDoc documenting minimum requirements (8+ chars, upper/lower/digit/special)
- **`SecurityConfig.java` / `WebConfig.java`**: Standardized CORS origins to `http://localhost:5173`
- **`AuthController.java`**: JavaDoc updates clarifying cookie-based JWT flow and Facebook debug_token verification
- **`AuthService.java`**: Added `handleFailedLogin()` with lockout logic; deprecated `refresh(RefreshRequest)` in favor of `refreshByToken(String)`

**Affected modules:** Auth, Security, Backend Configuration

### Feature 5: Documentation Synchronization

**Business Description:**
- Add complete use case documentation and sequence diagrams
- Synchronize HTML and PUML files with actual implementation

**Technical Description:**
- **`usecase/usecase_auth_copy.html`**: Complete use case document for all auth flows (UC-6A through UC-6D)
- **PUML files**: `usecase_auth_6a_uml.puml`, `6b_uml.puml`, `6c_uml.puml`, `6d_uml.puml` — sequence diagrams with proper participants (User, Frontend, Backend, Database, EmailService, Cloudinary, Google/Meta)
- **Event documentation**: `usecase_event_detail.html`, `usecase_event_interaction.html` with corresponding PUML diagrams
- **Sequence images**: 6 PNG files in `sequence/` directory

**Affected modules:** Documentation

---

## Database Changes

No database schema changes. Token expiration is handled via `used_at` / `expires_at` columns that already exist.

---

## API Changes

No API contract changes. All changes were:
- **Backend-internal**: New `CloudinaryService` (no new endpoints), `AuthService` internal refactoring
- **Configuration**: Environment variable additions only
- **Frontend**: Component refactoring, no new API calls

---

## Impact Analysis

| Module | Impact |
|--------|--------|
| **Auth (Backend)** | Email templates rewritten — verify redirect URL hasn't changed. Token refresh now prefers cookie-based flow. Cloudinary integration is additive (graceful fallback if not configured) |
| **Auth (Frontend)** | Default theme changed to light mode. Error messages now theme-aware. Google button uses custom rendering. Verify email dialog respects theme |
| **Admin** | No changes to admin features |
| **Customer** | No changes to customer-facing features beyond auth |
| **Event Interaction** | No impact on MVP_KLTN or event features |

---

## Conflict Analysis

**Conflicts detected:** None

**Resolution strategy:** N/A

The `auth` branch is 11 commits ahead of `main`. `git merge-tree` analysis confirmed zero merge conflicts — no files were changed in both branches simultaneously.

---

## Regression Review Checklist

- [x] **Register** (email/password) — works with Cloudinary default avatar
- [x] **Login** — works with rate limiting
- [x] **Email Verification** — HTML template centered correctly, token validation works
- [x] **Forgot Password** — simplified success message, HTML email sent
- [x] **Reset Password** — HTML template centered, token marking via `used_at`
- [x] **Google Login** — custom button, avatar uploaded to Cloudinary
- [x] **Facebook Login** — debug_token + Graph API verification, avatar uploaded to Cloudinary
- [x] **Provider Registration** — unaffected
- [x] **Provider Approval** — unaffected
- [x] **Cloudinary Upload** — graceful fallback when not configured

---

## Testing Guide

### Prerequisites
- Backend running on `http://localhost:8080`
- Frontend running on `http://localhost:5173`
- Cloudinary credentials (optional — falls back gracefully)

### Test Routes

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| **Light mode default** | Clear localStorage, visit any auth page | Theme is light, not dark |
| **Theme persistence** | Toggle to dark, refresh | Stays dark |
| **Verify email dialog** | Register with email/password | Dialog uses light/dark card background matching theme |
| **Error message contrast** | Submit invalid login credentials in light mode | Error message has dark red text on light pink background (visible) |
| **Email template** | Request password reset | Check email in Mailtrap — heading is centered, layout is professional |
| **Google login** | Click Google SSO button | Avatar appears in Cloudinary after login |
| **Facebook login** | Click Facebook login | debug_token verified by backend, avatar uploaded |

### Database Validation
```sql
-- Check Cloudinary avatar was stored for OAuth users
SELECT email, avatar_url FROM users WHERE avatar_url LIKE '%cloudinary%';

-- Check failed login count
SELECT email, failed_login_count, account_locked_until FROM users WHERE failed_login_count > 0;
```

---

## Files Modified (38 files)

| File | Action | Type |
|------|--------|------|
| `backend/src/main/java/.../CloudinaryService.java` | **New** | Backend |
| `backend/src/main/java/.../EmailService.java` | Rewritten | Backend |
| `backend/src/main/java/.../AuthService.java` | Modified | Backend |
| `backend/src/main/java/.../SocialAuthService.java` | Modified | Backend |
| `backend/src/main/java/.../AuthController.java` | Modified | Backend |
| `backend/src/main/java/.../AuthRateLimiter.java` | Modified | Backend |
| `backend/src/main/java/.../PasswordPolicy.java` | Modified | Backend |
| `backend/src/main/java/.../SecurityConfig.java` | Modified | Backend |
| `backend/src/main/java/.../WebConfig.java` | Modified | Backend |
| `backend/pom.xml` | Modified | Backend |
| `backend/.env.example` | Modified | Config |
| `backend/src/main/resources/application.properties` | Modified | Config |
| `frontend/src/components/auth/AuthFormMessage.tsx` | Modified | Frontend |
| `frontend/src/components/auth/OAuthButtons.tsx` | Modified | Frontend |
| `frontend/src/index.css` | Modified | Frontend |
| `frontend/src/pages/auth/ForgotPasswordPage.tsx` | Modified | Frontend |
| `frontend/src/pages/auth/RegisterPage.tsx` | Modified | Frontend |
| `frontend/src/theme/ThemeContext.tsx` | Modified | Frontend |
| `frontend/package.json` | Modified | Frontend |
| `frontend/package-lock.json` | Modified | Frontend |
| `frontend/vite.config.ts` | Modified | Frontend |
| `sequence/*.png` (6 files) | **New** | Docs |
| `usecase/usecase_auth_copy.html` | **New** | Docs |
| `usecase/usecase_auth_6a_uml.puml` | **New** | Docs |
| `usecase/usecase_auth_6b_uml.puml` | **New** | Docs |
| `usecase/usecase_auth_6c_uml.puml` | **New** | Docs |
| `usecase/usecase_auth_6d_uml.puml` | **New** | Docs |
| `usecase/usecase_event_detail.html` | **New** | Docs |
| `usecase/usecase_event_detail_uml.puml` | **New** | Docs |
| `usecase/usecase_event_interaction.html` | **New** | Docs |
| `usecase/usecase_event_interaction_uml.puml` | **New** | Docs |

---

## Build Verification

- ✅ Backend: `mvnw compile` — passes (no errors)
- ✅ Frontend: `npx tsc --noEmit` — passes (no type errors)
