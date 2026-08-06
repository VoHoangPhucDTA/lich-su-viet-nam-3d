import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTtsAudioAsset,
  isTtsAudioAssetPending,
  requestTtsAudioAsset,
} from './ttsAudioAssetService';
import { clearCsrfToken } from './csrfClient';

const pendingAsset = {
  status: 'pending' as const,
  assetId: 'asset-1',
  eventId: 'event-1',
  audioUrl: null,
  voice: 'hcm-diemmy',
  cacheHit: false,
  stale: false,
  retryEligible: false,
  retryAfterSeconds: 10,
  staleAfter: null,
  errorCode: null,
  message: null,
  durationMs: null,
};

function apiResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({
    success: status >= 200 && status < 300,
    code: status >= 200 && status < 300 ? 'OK' : 'API_ERROR',
    message: '',
    data,
    timestamp: '2026-01-01T00:00:00Z',
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

function csrfResponse(): Response {
  return apiResponse({ token: 'csrf-token', headerName: 'X-CSRF-TOKEN' });
}

beforeEach(clearCsrfToken);
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ttsAudioAssetService', () => {
  it('posts only the selected voice to the event asset endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(apiResponse(pendingAsset, 202));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestTtsAudioAsset('event / 1', 'hcm-diemmy')).resolves.toEqual(pendingAsset);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(expect.stringContaining('/api/tts/events/event%20%2F%201/audio'));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ voice: 'hcm-diemmy' }),
      credentials: 'include',
    });
  });

  it('does not replay a failed asset POST automatically', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(apiResponse(null, 503));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestTtsAudioAsset('event-1', 'hcm-diemmy')).rejects.toMatchObject({ code: 'API_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes cancellation through to the read-only poll request', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(apiResponse(pendingAsset));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getTtsAudioAsset('asset / 1', controller.signal)).resolves.toEqual(pendingAsset);

    expect(fetchMock.mock.calls[0]?.[0]).toEqual(expect.stringContaining('/api/tts/audio-assets/asset%20%2F%201'));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', signal: controller.signal });
  });

  it('recognizes all non-terminal asset statuses for sequential polling', () => {
    expect(isTtsAudioAssetPending('pending')).toBe(true);
    expect(isTtsAudioAssetPending('synthesizing')).toBe(true);
    expect(isTtsAudioAssetPending('uploading')).toBe(true);
    expect(isTtsAudioAssetPending('assembling')).toBe(true);
    expect(isTtsAudioAssetPending('ready')).toBe(false);
    expect(isTtsAudioAssetPending('failed')).toBe(false);
  });
});
