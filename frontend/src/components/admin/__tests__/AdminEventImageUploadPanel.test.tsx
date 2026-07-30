import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEventImageUploadPanel from '../AdminEventImageUploadPanel';
import {
  uploadAdminEventImage,
  type AdminEventDetail,
} from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return { ...actual, uploadAdminEventImage: vi.fn() };
});

const version0 = '2026-07-30T01:02:03.000001Z';
const version1 = '2026-07-30T01:02:04.000002Z';
const version2 = '2026-07-30T01:02:05.000003Z';

function detail(version: string, media: AdminEventDetail['media']['items'] = []): AdminEventDetail {
  return {
    publication: { updatedAt: version },
    media: { thumbnail: null, activeCount: media.length, items: media },
  } as unknown as AdminEventDetail;
}

function media(id: number, url: string): AdminEventDetail['media']['items'][number] {
  return {
    id,
    mediaType: 'image',
    url,
    urlSafe: true,
    caption: null,
    altText: `Ảnh ${id}`,
    sourceName: null,
    license: null,
    storageType: 'object_storage',
    managed: true,
    thumbnail: false,
    sortOrder: id,
    status: 'active',
    createdAt: '2026-07-30T01:00:00Z',
  };
}

function Harness({
  onBusyChange = vi.fn(),
  onPersistentBlock = vi.fn(),
}: {
  onBusyChange?: (busy: boolean) => void;
  onPersistentBlock?: (message: string) => void;
}) {
  const [current, setCurrent] = useState(detail(version0));
  return (
    <AdminEventImageUploadPanel
      eventId="event-1"
      detail={current}
      version={current.publication.updatedAt}
      onUpdated={setCurrent}
      onBusyChange={onBusyChange}
      onPersistentBlock={onPersistentBlock}
    />
  );
}

describe('AdminEventImageUploadPanel', () => {
  const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('keeps the queue mounted across parent rerenders and chains exact response versions', async () => {
    vi.mocked(uploadAdminEventImage)
      .mockResolvedValueOnce({
        mediaId: 11,
        updatedAt: version1,
        event: detail(version1, [media(11, '/api/admin-e2e/event-images/a')]),
      })
      .mockResolvedValueOnce({
        mediaId: 12,
        updatedAt: version2,
        event: detail(version2, [
          media(11, '/api/admin-e2e/event-images/a'),
          media(12, '/api/admin-e2e/event-images/b'),
        ]),
      });
    render(<Harness />);
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ];
    await userEvent.upload(screen.getByLabelText('Chọn ảnh thư viện'), files);
    const altFields = screen.getAllByLabelText(/Mô tả thay thế/);
    await userEvent.type(altFields[1], 'Ảnh A');
    await userEvent.type(altFields[2], 'Ảnh B');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' }));

    await waitFor(() => expect(uploadAdminEventImage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(uploadAdminEventImage).mock.calls[0][1].expectedUpdatedAt).toBe(version0);
    expect(vi.mocked(uploadAdminEventImage).mock.calls[1][1].expectedUpdatedAt).toBe(version1);
    expect(vi.mocked(uploadAdminEventImage).mock.calls[0][1].file.name).toBe('a.png');
    expect(vi.mocked(uploadAdminEventImage).mock.calls[1][1].file.name).toBe('b.png');
    expect(screen.getByText('a.png')).toBeInTheDocument();
    expect(screen.getByText('b.png')).toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:b.png');
  });

  it('releases transient busy and persistently blocks on inconsistent response versions', async () => {
    const onBusyChange = vi.fn();
    const onPersistentBlock = vi.fn();
    vi.mocked(uploadAdminEventImage).mockResolvedValue({
      mediaId: 11,
      updatedAt: version1,
      event: detail(version2, [media(11, '/api/admin-e2e/event-images/a')]),
    });
    render(<Harness onBusyChange={onBusyChange} onPersistentBlock={onPersistentBlock} />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' }));

    await waitFor(() => expect(onPersistentBlock).toHaveBeenCalledTimes(1));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('reconciliation_required')).toBeInTheDocument();
  });

  it('rejects a complete over-limit selection before creating previews', async () => {
    render(<Harness />);
    const files = Array.from({ length: 11 }, (_, index) =>
      new File(['x'], `${index}.png`, { type: 'image/png' }));
    await userEvent.upload(screen.getByLabelText('Chọn ảnh thư viện'), files);

    expect(screen.getByText(/Toàn bộ lựa chọn mới đã bị từ chối/)).toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes local previews on removal and unmount without double revocation', async () => {
    const rendered = render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ a.png khỏi hàng đợi' }));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    rendered.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes a replaced thumbnail only after detach and revokes the reset preview once', async () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    render(<Harness />);
    const input = screen.getByLabelText('Chọn ảnh đại diện');

    await userEvent.upload(input, new File(['a'], 'first.png', { type: 'image/png' }));
    await userEvent.upload(input, new File(['b'], 'second.png', { type: 'image/png' }));
    expect(revokeObjectURL).not.toHaveBeenCalled();

    animationFrames.shift()?.(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first.png');
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ ảnh đã chọn' }));
    animationFrames.shift()?.(0);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second.png');
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('switches a successful thumbnail to server state and releases its local preview', async () => {
    vi.mocked(uploadAdminEventImage).mockResolvedValue({
      mediaId: 21,
      updatedAt: version1,
      event: {
        ...detail(version1, [media(21, '/api/admin-e2e/event-images/thumb')]),
        media: {
          ...detail(version1, [media(21, '/api/admin-e2e/event-images/thumb')]).media,
          thumbnail: {
            id: 21,
            url: '/api/admin-e2e/event-images/thumb',
            altText: 'Ảnh đại diện',
          },
        },
      },
    });
    render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh đại diện'),
      new File(['thumb'], 'thumb.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[0], 'Ảnh đại diện');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lên làm ảnh đại diện' }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:thumb.png'));
    expect(screen.getByText(/Đã tải ảnh đại diện/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bỏ ảnh đã chọn' })).not.toBeInTheDocument();
  });

  it('preserves a deterministic partial failure and revokes only the succeeded preview', async () => {
    vi.mocked(uploadAdminEventImage)
      .mockResolvedValueOnce({
        mediaId: 11,
        updatedAt: version1,
        event: detail(version1, [media(11, '/api/admin-e2e/event-images/a')]),
      })
      .mockRejectedValueOnce(new ApiRequestError('EVENT_IMAGE_INVALID_CONTENT', 'invalid', 400));
    const rendered = render(<Harness />);
    await userEvent.upload(screen.getByLabelText('Chọn ảnh thư viện'), [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]);
    const altFields = screen.getAllByLabelText(/Mô tả thay thế/);
    await userEvent.type(altFields[1], 'Ảnh A');
    await userEvent.type(altFields[2], 'Ảnh B');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' }));

    await screen.findByRole('button', { name: 'Thử lại ảnh này' });
    expect(screen.getByText('succeeded')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:b.png');
    rendered.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:b.png');
  });

  it('turns a stale conflict into a persistent reconciliation block and releases busy', async () => {
    const onBusyChange = vi.fn();
    const onPersistentBlock = vi.fn();
    vi.mocked(uploadAdminEventImage).mockRejectedValue(
      new ApiRequestError('EVENT_UPDATE_CONFLICT', 'conflict', 409),
    );
    const rendered = render(
      <Harness onBusyChange={onBusyChange} onPersistentBlock={onPersistentBlock} />,
    );
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'conflict.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh conflict');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' }));

    await waitFor(() => expect(onPersistentBlock).toHaveBeenCalledTimes(1));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('reconciliation_required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại ảnh này' })).not.toBeInTheDocument();
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:conflict.png');
    rendered.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:conflict.png');
  });

  it('keeps deterministic failures retryable but makes ambiguous failures reconciliation-only', async () => {
    vi.mocked(uploadAdminEventImage).mockRejectedValueOnce(
      new ApiRequestError('EVENT_IMAGE_INVALID_CONTENT', 'invalid', 400),
    );
    const { unmount } = render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' }));
    expect(await screen.findByRole('button', { name: 'Thử lại ảnh này' })).toBeEnabled();
    unmount();

    vi.mocked(uploadAdminEventImage).mockRejectedValueOnce(new TypeError('network'));
    const onPersistentBlock = vi.fn();
    render(<Harness onPersistentBlock={onPersistentBlock} />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['b'], 'b.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh B');
    await userEvent.click(screen.getByRole('button', { name: 'Tải lần lượt ảnh đang chờ' }));
    await waitFor(() => expect(onPersistentBlock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Thử lại ảnh này' })).not.toBeInTheDocument();
  });
});
