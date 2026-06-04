import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  User,
  VerifyEmailResponse,
} from '../types/auth';
import {
  apiGet,
  apiPost,
  clearStoredUser,
  loadStoredUser,
  saveStoredUser,
  type StoredUser,
} from './apiClient';

// ── Helpers lưu trữ User info (non-sensitive) ────────────────────────────────
// Token (access + refresh) được quản lý hoàn toàn bởi HttpOnly Cookie.
// localStorage chỉ lưu thông tin User để hiển thị UI (tên, avatar, role...).

function toStoredUser(user: User): StoredUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    grade: user.grade,
    school: user.school,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

export function getCurrentUser(): User | null {
  const stored = loadStoredUser();
  if (!stored) return null;
  return stored as User;
}


// ── Auth operations ───────────────────────────────────────────────────────────

export async function login(req: LoginRequest): Promise<AuthResponse> {
  // Bước 6B.1.3: authService.ts: gọi POST /api/auth/login đến AuthController.java
  const response = await apiPost<AuthResponse>('/api/auth/login', req);
  // Bước 6B.1.9: authService.ts: lưu User info vào localStorage (Token được browser lưu tự động qua HttpOnly Cookie)
  saveStoredUser(toStoredUser(response.user));
  return response;
}

export async function register(req: RegisterRequest): Promise<RegisterResponse> {
  // Bước 6A.1.3: authService.ts: gọi POST /api/auth/register đến AuthController.java
  clearStoredUser();
  // Bước 6A.1.10: authService.ts: trả dữ liệu cho RegisterPage.tsx
  return apiPost<RegisterResponse>('/api/auth/register', req);
}

export async function resendVerification(req: ResendVerificationRequest): Promise<RegisterResponse> {
  return apiPost<RegisterResponse>('/api/auth/resend-verification', req);
}

export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  const response = await apiGet<VerifyEmailResponse>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  if (response.auth?.user) {
    saveStoredUser(toStoredUser(response.auth.user));
  }
  return response;
}

export async function logout(): Promise<void> {
  // Gọi backend để xóa HttpOnly Cookie — frontend không thể tự xóa cookie HttpOnly
  // QUAN TRỌNG: catch error riêng biệt, không để nó propagate lên caller.
  // Nếu API lỗi (network down, backend restart...), frontend vẫn phải đăng xuất được.
  try {
    // Bước 6D.1.4: authService.ts: gọi POST /api/auth/logout đến AuthController.java
    await apiPost<{ message: string }>('/api/auth/logout');
  } catch {
    // Bước 6D.2.1: authService.ts: catch block bắt lỗi API — bỏ qua, không throw lên caller
    // localStorage vẫn được xóa ở bước tiếp theo.
    // Cookie HttpOnly phía backend sẽ tự hết hạn theo maxAge.
  } finally {
    // Bước 6D.1.7: authService.ts: clearStoredUser() — luôn xóa auth_user khỏi localStorage kể cả khi API lỗi
    clearStoredUser();
  }
}

export async function refreshCurrentUser(): Promise<User> {
  // GET /api/auth/me — access_token được đính kèm tự động qua HttpOnly Cookie
  const user = await apiGet<User>('/api/auth/me');
  saveStoredUser(toStoredUser(user));
  return user;
}

export async function forgotPassword(_email: string): Promise<{ message: string }> {
  // Bước 6C.1.3: authService.ts: gọi POST /api/auth/forgot-password đến AuthController.java
  return apiPost<{ message: string }>('/api/auth/forgot-password', { email: _email });
}

export async function resetPassword(req: ResetPasswordRequest): Promise<{ message: string }> {
  // Bước 6C.1.14: authService.ts: gọi POST /api/auth/reset-password đến AuthController.java
  return apiPost<{ message: string }>('/api/auth/reset-password', req);
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  // Bước 6B.2.3: authService.ts: gọi POST /api/auth/oauth/google đến AuthController.java
  const response = await apiPost<AuthResponse>('/api/auth/oauth/google', {
    provider: 'google',
    token: idToken,
  });
  // Bước 6B.2.12: authService.ts: lưu User info (Token được browser lưu tự động qua HttpOnly Cookie)
  saveStoredUser(toStoredUser(response.user));
  return response;
}

export async function loginWithFacebook(accessToken: string): Promise<AuthResponse> {
  const response = await apiPost<AuthResponse>('/api/auth/oauth/facebook', {
    provider: 'facebook',
    token: accessToken,
  });
  saveStoredUser(toStoredUser(response.user));
  return response;
}

export async function updateProfile(updates: UpdateProfileRequest): Promise<User> {
  // Gọi PATCH API để cập nhật profile thực sự lên server
  const updatedUser = await apiPost<User>('/api/auth/me/update', updates);
  saveStoredUser(toStoredUser(updatedUser));
  return updatedUser;
}
