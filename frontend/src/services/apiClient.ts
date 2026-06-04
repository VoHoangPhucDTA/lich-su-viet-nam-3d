export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

/**
 * Base URL cho API calls.
 * - Dev: chuỗi rỗng "" — Vite proxy sẽ route /api/* → http://localhost:8080
 *   (proxy giúp frontend và backend cùng origin → cookie HttpOnly hoạt động không cần SameSite=None)
 * - Prod: URL backend Render đầy đủ, cấu hình qua biến môi trường VITE_API_BASE_URL
 */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

/** Chỉ lưu thông tin User (non-sensitive) vào localStorage để hiển thị UI. Token KHÔNG lưu ở đây. */
const USER_STORAGE_KEY = 'auth_user';

export interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  grade?: string;
  school?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export class ApiRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
  }
}

export function loadStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export function saveStoredUser(user: StoredUser): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Làm mới access_token bằng cách gọi /api/auth/refresh.
 * Refresh token được gửi tự động qua HttpOnly Cookie (không cần đọc từ localStorage).
 * Backend sẽ set lại cả hai cookie mới trong response.
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    // Không gửi body — refresh_token nằm trong HttpOnly Cookie (path=/api/auth/refresh).
    // Backend đọc cookie trực tiếp, không cần @RequestBody nữa.
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      // credentials: 'include' bắt buộc để browser đính kèm refresh_token cookie
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function apiRequest<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  // KHÔNG set Authorization header nữa — token được gửi tự động qua HttpOnly Cookie.
  // credentials: 'include' là bắt buộc để browser đính kèm cookie vào mọi request.

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include', // Bắt buộc cho HttpOnly Cookie cross-origin và same-origin
  });

  if (response.status === 401 && retry && !path.startsWith('/api/auth/refresh')) {
    // Access token hết hạn → thử refresh bằng cookie, sau đó replay request
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, init, false);
    }
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new ApiRequestError(payload.code || 'API_ERROR', payload.message || `API request failed: ${path}`);
  }

  return payload.data;
}

export function toQueryString(params: Record<string, string | number | undefined | null>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}
