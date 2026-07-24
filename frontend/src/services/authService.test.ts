import { beforeEach, describe, expect, it, vi } from 'vitest';

import { login } from './authService';

const user = {
  id: 'user-1',
  fullName: 'Admin User',
  email: 'admin@example.test',
  role: 'admin' as const,
};

describe('authService cookie-only response boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('hydrates the user without reading or storing token fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'Success',
      data: { user },
      timestamp: '2026-01-01T00:00:00Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const response = await login({ email: user.email, password: 'password' });

    expect(response).toEqual({ user });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      }),
    );
    const stored = localStorage.getItem('auth_user');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? '{}')).toEqual(user);
    expect(stored).not.toContain('accessToken');
    expect(stored).not.toContain('refreshToken');
  });
});
