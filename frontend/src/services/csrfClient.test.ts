import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CsrfBootstrapError,
  bootstrapCsrfToken,
  clearCsrfToken,
  getCsrfToken,
} from './csrfClient';

function csrfResponse(token = 'csrf-token') {
  return new Response(JSON.stringify({
    success: true,
    code: 'SUCCESS',
    message: 'Success',
    data: { token, headerName: 'X-CSRF-TOKEN' },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('csrfClient', () => {
  beforeEach(() => {
    clearCsrfToken();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('bootstraps into memory without persisting the token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(csrfResponse());

    await expect(bootstrapCsrfToken()).resolves.toEqual({
      token: 'csrf-token',
      headerName: 'X-CSRF-TOKEN',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/csrf$/),
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(getCsrfToken()?.token).toBe('csrf-token');
    expect(JSON.stringify(localStorage)).not.toContain('csrf-token');
    expect(JSON.stringify(sessionStorage)).not.toContain('csrf-token');
  });

  it('deduplicates concurrent bootstrap requests', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>(resolve => {
        resolveFetch = resolve;
      }),
    );

    const first = bootstrapCsrfToken();
    const second = bootstrapCsrfToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(csrfResponse('shared-token'));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { token: 'shared-token', headerName: 'X-CSRF-TOKEN' },
      { token: 'shared-token', headerName: 'X-CSRF-TOKEN' },
    ]);
  });

  it('surfaces a controlled bootstrap error and clears the in-flight request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(csrfResponse('recovered-token'));

    await expect(bootstrapCsrfToken()).rejects.toBeInstanceOf(CsrfBootstrapError);
    await expect(bootstrapCsrfToken()).resolves.toMatchObject({ token: 'recovered-token' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
