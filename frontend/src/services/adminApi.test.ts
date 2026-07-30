import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadAdminEventImage } from './adminApi';
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
