import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiGet, apiPost } from './apiClient';
import { clearCsrfToken } from './csrfClient';

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: status >= 200 && status < 300,
    code: status >= 200 && status < 300 ? 'SUCCESS' : 'ERROR',
    message: status >= 200 && status < 300 ? 'Success' : 'Error',
    data,
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function csrfResponse() {
  return response({ token: 'csrf-token', headerName: 'X-CSRF-TOKEN' });
}

describe('apiClient CSRF integration', () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it('does not bootstrap or attach CSRF for safe requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ id: 'event-1' }));

    await expect(apiGet('/api/events/event-1')).resolves.toEqual({ id: 'event-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('X-CSRF-TOKEN')).toBeNull();
  });

  it('bootstraps once and attaches the configured header to unsafe requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(response({ saved: true }));

    await expect(apiPost('/api/profile', { name: 'Admin' })).resolves.toEqual({ saved: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const headers = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-token');
  });

  it('deduplicates CSRF bootstrap across concurrent unsafe requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      return url.endsWith('/api/auth/csrf')
        ? csrfResponse()
        : response({ saved: true });
    });

    await Promise.all([
      apiPost('/api/action-one', {}),
      apiPost('/api/action-two', {}),
    ]);

    const csrfCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith('/api/auth/csrf'));
    expect(csrfCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('includes CSRF when refreshing an expired cookie session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(null, 401))
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(response({ user: true }))
      .mockResolvedValueOnce(response({ id: 'event-1' }));

    await expect(apiGet('/api/protected')).resolves.toEqual({ id: 'event-1' });

    const refreshCall = fetchMock.mock.calls[2];
    expect(String(refreshCall[0])).toMatch(/\/api\/auth\/refresh$/);
    const headers = refreshCall[1]?.headers as Record<string, string>;
    expect(headers['X-CSRF-TOKEN']).toBe('csrf-token');
  });

  it('does not refresh or replay an unsafe request after a 401', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(response(null, 401));

    await expect(apiPost('/api/mutation', { value: true })).rejects.toMatchObject({
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/api\/mutation$/);
  });
});
