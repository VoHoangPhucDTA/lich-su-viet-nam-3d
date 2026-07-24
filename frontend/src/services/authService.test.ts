import { beforeEach, describe, expect, it, vi } from 'vitest';

import { login, logout } from './authService';
import { clearCsrfToken } from './csrfClient';

const user = {
  id: 'user-1',
  fullName: 'Admin User',
  email: 'admin@example.test',
  role: 'admin' as const,
};

describe('authService cookie-only response boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it('hydrates the user without reading or storing token fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        code: 'SUCCESS',
        message: 'Success',
        data: { token: 'csrf-before-login', headerName: 'X-CSRF-TOKEN' },
        timestamp: '2026-01-01T00:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'Success',
      data: { user },
      timestamp: '2026-01-01T00:00:00Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        code: 'SUCCESS',
        message: 'Success',
        data: { token: 'csrf-after-login', headerName: 'X-CSRF-TOKEN' },
        timestamp: '2026-01-01T00:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const response = await login({ email: user.email, password: 'password' });

    expect(response).toEqual({ user });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.any(Headers),
      }),
    );
    const loginHeaders = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(loginHeaders.get('X-CSRF-TOKEN')).toBe('csrf-before-login');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/\/api\/auth\/csrf$/),
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    const stored = localStorage.getItem('auth_user');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}')).toEqual(user);
    expect(stored).not.toContain('accessToken');
    expect(stored).not.toContain('refreshToken');
  });

  it('sends CSRF on logout and refreshes the token after clearing the session', async () => {
    localStorage.setItem('auth_user', JSON.stringify(user));
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        code: 'SUCCESS',
        message: 'Success',
        data: { token: 'csrf-before-logout', headerName: 'X-CSRF-TOKEN' },
        timestamp: '2026-01-01T00:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        code: 'SUCCESS',
        message: 'Success',
        data: { message: 'Logged out' },
        timestamp: '2026-01-01T00:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        code: 'SUCCESS',
        message: 'Success',
        data: { token: 'csrf-after-logout', headerName: 'X-CSRF-TOKEN' },
        timestamp: '2026-01-01T00:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    await logout();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/api\/auth\/logout$/),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const logoutHeaders = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(logoutHeaders.get('X-CSRF-TOKEN')).toBe('csrf-before-logout');
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/\/api\/auth\/csrf$/),
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(localStorage.getItem('auth_user')).toBeNull();
  });
});
