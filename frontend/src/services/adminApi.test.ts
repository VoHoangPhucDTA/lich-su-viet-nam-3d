import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminMediaCleanup, getAdminMediaCleanupSummary, replaceAdminEventImage, uploadAdminEventImage } from './adminApi';
import { clearCsrfToken } from './csrfClient';

function envelope(data: unknown) {
  return new Response(JSON.stringify({
    success: true,
    code: 'SUCCESS',
    message: 'Success',
    data,
  }), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

describe('uploadAdminEventImage', () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it('appends only the exact supported nonblank multipart fields', async () => {
    const event = {
      publication: { updatedAt: '2026-07-30T01:02:04.000002Z' },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(envelope({ token: 'csrf', headerName: 'X-CSRF-TOKEN' }))
      .mockResolvedValueOnce(envelope({
        mediaId: 9,
        updatedAt: '2026-07-30T01:02:04.000002Z',
        event,
      }));

    const file = new File(['fixture'], 'fixture.png', { type: 'image/png' });
    await uploadAdminEventImage('event/one', {
      file,
      expectedUpdatedAt: '2026-07-30T01:02:03.000001Z',
      kind: 'gallery',
      altText: '  Ảnh di tích  ',
      caption: '  Chú thích  ',
      sourceName: ' ',
      license: '',
    });

    expect(String(fetchMock.mock.calls[1][0]))
      .toContain('/api/admin/events/event%2Fone/media/images');
    const init = fetchMock.mock.calls[1][1]!;
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual([
      'file', 'expectedUpdatedAt', 'kind', 'altText', 'caption',
    ]);
    expect(form.get('file')).toBe(file);
    expect(form.get('kind')).toBe('gallery');
    expect(form.get('caption')).toBe('Chú thích');
    expect(form.has('sourceName')).toBe(false);
    expect(form.has('license')).toBe(false);
    expect((init.headers as Headers).has('Content-Type')).toBe(false);
  });
});

describe('replaceAdminEventImage', () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it('uses the dedicated replacement route and sends no browser-controlled storage identity', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(envelope({ token: 'csrf', headerName: 'X-CSRF-TOKEN' }))
      .mockResolvedValueOnce(envelope({ mediaId: 9, updatedAt: '2026-07-30T01:02:04.000002Z', event: {} }));
    const file = new File(['fixture'], 'replacement.png', { type: 'image/png' });

    await replaceAdminEventImage('event/one', 9, {
      file, expectedUpdatedAt: '2026-07-30T01:02:03.000001Z', caption: '  New  ', altText: '  Alt  ',
    });

    expect(String(fetchMock.mock.calls[1][0]))
      .toContain('/api/admin/events/event%2Fone/media/9/replacement');
    const form = fetchMock.mock.calls[1][1]!.body as FormData;
    expect([...form.keys()]).toEqual(['file', 'expectedUpdatedAt', 'altText', 'caption']);
    expect(form.get('file')).toBe(file);
    expect(form.has('publicId')).toBe(false);
    expect(form.has('managedAssetId')).toBe(false);
  });
});

describe('managed cleanup reads', () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it('uses read-only bounded cleanup endpoints without a worker action', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(envelope({ pending: 1, claimed: 0, failed: 2, completed: 3 }))
      .mockResolvedValueOnce(envelope({ items: [], count: 0, total: 0, limit: 25, offset: 0 }));

    await getAdminMediaCleanupSummary();
    await getAdminMediaCleanup({ status: 'FAILED', operation: 'DELETE', sortBy: 'nextAttemptAt', sortDir: 'asc', limit: 25, offset: 0 });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/admin/media-cleanup/summary');
    expect(String(fetchMock.mock.calls[1][0])).toContain('status=FAILED');
    expect(String(fetchMock.mock.calls[1][0])).toContain('operation=DELETE');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('process');
  });
});
