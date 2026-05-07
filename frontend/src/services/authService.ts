import type { AuthResponse, LoginRequest, RegisterRequest, UpdateProfileRequest, User } from '../types/auth';
import { MOCK_USERS } from '../data/mockUsers';

const STORAGE_KEY = 'auth_state';

interface StoredAuthState {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// --- Helpers ---

function generateToken(): string {
  return 'mock_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
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

/**
 * getCurrentUser — synchronously returns the persisted user.
 * When connecting to a real backend, replace this with a GET /auth/me API call.
 */
export function getCurrentUser() {
  return loadFromStorage()?.user ?? null;
}

/**
 * getAccessToken — returns stored JWT token.
 * Use as Authorization: Bearer <token> header in real API requests.
 */
export function getAccessToken(): string | null {
  return loadFromStorage()?.accessToken ?? null;
}

// --- Public API ---

export async function login(req: LoginRequest): Promise<AuthResponse> {
  await delay(500);

  const record = MOCK_USERS.find(
    (u) => u.user.email === req.email && u.password === req.password
  );

  if (!record) {
    throw new Error('Email hoặc mật khẩu không đúng.');
  }

  const response: AuthResponse = {
    accessToken: generateToken(),
    refreshToken: generateToken(),
    user: { ...record.user },
  };

  saveToStorage(response);
  return response;
}

export async function register(req: RegisterRequest): Promise<AuthResponse> {
  await delay(500);

  // Check if email already exists
  const exists = MOCK_USERS.some((u) => u.user.email === req.email);
  if (exists) {
    throw new Error('Email đã được đăng ký.');
  }

  const newUser: User = {
    id: 'user-' + Date.now(),
    fullName: req.fullName,
    email: req.email,
    role: 'student',
    grade: req.grade,
    school: req.school,
    avatarUrl: '',
    createdAt: new Date().toISOString(),
  };

  // Add to mock users list (runtime only, lost on refresh)
  MOCK_USERS.push({ user: newUser, password: req.password });

  const response: AuthResponse = {
    accessToken: generateToken(),
    refreshToken: generateToken(),
    user: newUser,
  };

  saveToStorage(response);
  return response;
}

export async function logout(): Promise<void> {
  await delay(200);
  clearStorage();
}

export async function forgotPassword(_email: string): Promise<{ message: string }> {
  await delay(600);
  // Always return success message for security (don't reveal if email exists)
  return {
    message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
  };
}

export async function resetPassword(newPassword: string): Promise<{ message: string }> {
  await delay(500);
  if (newPassword.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }
  return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
}

export async function loginWithGoogle(): Promise<AuthResponse> {
  await delay(800);
  // Mock: log in as student
  const student = MOCK_USERS.find((u) => u.user.role === 'student')!;
  const response: AuthResponse = {
    accessToken: generateToken(),
    refreshToken: generateToken(),
    user: { ...student.user, fullName: 'Google User Demo' },
  };
  saveToStorage(response);
  return response;
}

export async function loginWithFacebook(): Promise<AuthResponse> {
  await delay(800);
  const student = MOCK_USERS.find((u) => u.user.role === 'student')!;
  const response: AuthResponse = {
    accessToken: generateToken(),
    refreshToken: generateToken(),
    user: { ...student.user, fullName: 'Facebook User Demo' },
  };
  saveToStorage(response);
  return response;
}

export async function updateProfile(updates: UpdateProfileRequest): Promise<User> {
  await delay(400);
  const stored = loadFromStorage();
  if (!stored) {
    throw new Error('Bạn chưa đăng nhập.');
  }

  const updatedUser: User = {
    ...stored.user,
    ...updates,
  };

  saveToStorage({ ...stored, user: updatedUser });
  return updatedUser;
}

// --- Utility ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
