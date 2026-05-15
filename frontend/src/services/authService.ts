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
import { apiGet, apiPost } from './apiClient';

const STORAGE_KEY = 'auth_state';

interface StoredAuthState {
  accessToken: string;
  refreshToken: string;
  user: User;
}

function saveToStorage(state: StoredAuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadFromStorage(): StoredAuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuthState;
  } catch {
    clearStorage();
    return null;
  }
}

export function getCurrentUser() {
  return loadFromStorage()?.user ?? null;
}

export function getAccessToken(): string | null {
  return loadFromStorage()?.accessToken ?? null;
}

export async function login(req: LoginRequest): Promise<AuthResponse> {
  // Bước 6B.1.3: authService.ts: gọi POST /api/auth/login đến AuthController.java
  // Bước 6B.4.5: authService.ts: ném lỗi về cho LoginPage.tsx (nếu API trả lỗi)
  // Real backend path: successful login returns tokens + AuthUserDto in the mock-compatible shape.
  const response = await apiPost<AuthResponse>('/api/auth/login', req);
  // Bước 6B.1.9: authService.ts: lưu Token và trả dữ liệu cho LoginPage.tsx
  saveToStorage(response);
  return response;
}

export async function register(req: RegisterRequest): Promise<RegisterResponse> {
  // Bước 6A.1.3: authService.ts: gọi POST /api/auth/register đến AuthController.java
  // Bước 6A.2.5: authService.ts: ném lỗi về cho RegisterPage.tsx (nếu API trả lỗi)
  clearStorage();
  // Bước 6A.1.10: authService.ts: trả dữ liệu cho RegisterPage.tsx
  return apiPost<RegisterResponse>('/api/auth/register', req);
}

export async function resendVerification(req: ResendVerificationRequest): Promise<RegisterResponse> {
  return apiPost<RegisterResponse>('/api/auth/resend-verification', req);
}

export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  const response = await apiGet<VerifyEmailResponse>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  if (response.auth) {
    saveToStorage(response.auth);
  }
  return response;
}

export async function logout(): Promise<void> {
  clearStorage();
}

export async function refreshCurrentUser(): Promise<User> {
  // GET /api/auth/me is the source of truth that the saved token maps to a real DB user.
  const user = await apiGet<User>('/api/auth/me');
  const stored = loadFromStorage();
  if (stored) {
    saveToStorage({ ...stored, user });
  }
  return user;
}

export async function forgotPassword(_email: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>('/api/auth/forgot-password', { email: _email });
}

export async function resetPassword(req: ResetPasswordRequest): Promise<{ message: string }> {
  // Bước 6C.1.14: authService.ts: gọi POST /api/auth/reset-password đến AuthController.java
  return apiPost<{ message: string }>('/api/auth/reset-password', req);
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const response = await apiPost<AuthResponse>('/api/auth/oauth/google', {
    provider: 'google',
    token: idToken,
  });
  saveToStorage(response);
  return response;
}

export async function loginWithFacebook(accessToken: string): Promise<AuthResponse> {
  const response = await apiPost<AuthResponse>('/api/auth/oauth/facebook', {
    provider: 'facebook',
    token: accessToken,
  });
  saveToStorage(response);
  return response;
}

export async function updateProfile(updates: UpdateProfileRequest): Promise<User> {
  const stored = loadFromStorage();
  if (!stored) {
    throw new Error('Ban chua dang nhap.');
  }

  const updatedUser: User = {
    ...stored.user,
    ...updates,
  };

  saveToStorage({ ...stored, user: updatedUser });
  return updatedUser;
}
