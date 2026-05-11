export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ??
  'http://localhost:8080';
const AUTH_STORAGE_KEY = 'auth_state';

interface StoredAuthState {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}

export class ApiRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
  }
}

function loadStoredAuth(): StoredAuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuthState) : null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function saveStoredAuth(state: StoredAuthState) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

async function refreshAccessToken(): Promise<string | null> {
  // One retry path for protected APIs: use refreshToken, update localStorage, then replay once.
  const stored = loadStoredAuth();
  if (!stored?.refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: stored.refreshToken }),
  });
  const payload = (await response.json()) as ApiResponse<StoredAuthState>;
  if (!response.ok || !payload.success) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
  saveStoredAuth(payload.data);
  return payload.data.accessToken;
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
  // All backend calls pass through ApiResponse<T>; auth headers are attached from auth_state.
  const stored = loadStoredAuth();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (stored?.accessToken) {
    headers.set('Authorization', `Bearer ${stored.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && retry && !path.startsWith('/api/auth/refresh')) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
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
