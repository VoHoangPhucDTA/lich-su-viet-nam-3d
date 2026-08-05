import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEventImageUploadPanel from '../AdminEventImageUploadPanel';
import {
  getAdminImageUploadCapability,
  uploadAdminEventImage,
  type AdminEventDetail,
} from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

const readyCapability = {
  enabled: true,
  storageAvailable: true,
  uploadReady: true,
  maxFileBytes: 10 * 1024 * 1024,
  maxDimension: 6000,
  maxPixels: 25_000_000,
  maxActiveReservations: 3,
  allowedFormats: ['jpeg', 'png', 'webp'],
};

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    uploadAdminEventImage: vi.fn(),
    getAdminImageUploadCapability: vi.fn().mockResolvedValue({
      enabled: true,
      storageAvailable: true,
      uploadReady: true,
      maxFileBytes: 10 * 1024 * 1024,
      maxDimension: 6000,
      maxPixels: 25_000_000,
      maxActiveReservations: 3,
      allowedFormats: ['jpeg', 'png', 'webp'],
    }),
  };
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
    vi.mocked(getAdminImageUploadCapability).mockResolvedValue(readyCapability);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('accepts static WebP files for both thumbnail and gallery drop zones', async () => {
    render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh đại diện'),
      new File(['webp-bytes'], 'thumb.webp', { type: 'image/webp' }),
    );
    expect(screen.getByRole('button', { name: 'Bỏ ảnh đã chọn' })).toBeInTheDocument();

    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['webp-bytes'], 'photo.webp', { type: 'image/webp' }),
    );
    expect(screen.getByText('photo.webp')).toBeInTheDocument();
    expect(screen.getByText('Chờ tải')).toBeInTheDocument();
    expect(screen.getByText('photo.webp')).toHaveAttribute('title', 'photo.webp');
    expect(screen.queryByText(/Chỉ hỗ trợ tệp JPEG, PNG hoặc WebP/)).not.toBeInTheDocument();
  });

  it('hides the native English file input text and exposes only the custom drop zone', async () => {
    render(<Harness />);
    expect(screen.queryByText(/Choose Files|No file chosen/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chọn ảnh thư viện/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chọn ảnh đại diện/ })).toBeInTheDocument();
    const inputs = screen.getAllByLabelText(/Chọn ảnh (thư viện|đại diện)/);
    for (const input of inputs) {
      expect(input).toHaveClass('admin-dropzone-input');
    }
  });

  it('disables the pickers and shows one notice when backend upload is unavailable', async () => {
    vi.mocked(getAdminImageUploadCapability).mockResolvedValue({
      ...readyCapability,
      uploadReady: false,
    });
    render(<Harness />);

    expect(await screen.findByText(/Dịch vụ lưu trữ ảnh hiện chưa sẵn sàng/)).toBeInTheDocument();
    const galleryZone = screen.getByRole('button', { name: /Chọn ảnh thư viện/ });
    expect(galleryZone).toHaveAttribute('aria-disabled', 'true');
    expect(galleryZone).toHaveClass('admin-dropzone-disabled');
    expect(screen.getByRole('button', { name: /Chọn ảnh đại diện/ }))
      .toHaveAttribute('aria-disabled', 'true');
    // The batch action is intentionally absent (not just disabled) when the
    // queue has nothing to act on - the spec forbids an inactive button that
    // looks like it is doing work.
    expect(screen.queryByRole('button', { name: /Tải tất cả/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Choose Files')).not.toBeInTheDocument();
  });

  it('recovers after the operator retries the status check', async () => {
    vi.mocked(getAdminImageUploadCapability)
      .mockResolvedValueOnce({ ...readyCapability, uploadReady: false })
      .mockResolvedValue(readyCapability);
    render(<Harness />);

    await screen.findByText(/Dịch vụ lưu trữ ảnh hiện chưa sẵn sàng/);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại trạng thái' }));
    await waitFor(() =>
      expect(screen.queryByText(/Dịch vụ lưu trữ ảnh hiện chưa sẵn sàng/)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Chọn ảnh thư viện/ }))
      .not.toHaveAttribute('aria-disabled', 'true');
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
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (2)' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    await waitFor(() => expect(onPersistentBlock).toHaveBeenCalledTimes(1));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('Cần tải lại dữ liệu')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (2)' }));

    await screen.findByRole('button', { name: 'Thử lại ảnh này' });
    expect(screen.getByText('Đã tải')).toBeInTheDocument();
    expect(screen.getByText('Không thành công')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    await waitFor(() => expect(onPersistentBlock).toHaveBeenCalledTimes(1));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('Cần tải lại dữ liệu')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));
    await waitFor(() => expect(onPersistentBlock).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Thử lại ảnh này' })).not.toBeInTheDocument();
  });

  it('shows a Vietnamese error with the machine error code for a 503 storage outage', async () => {
    vi.mocked(uploadAdminEventImage).mockRejectedValue(
      new ApiRequestError('EVENT_IMAGE_UPLOAD_UNAVAILABLE', 'unavailable', 503),
    );
    render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    await waitFor(() =>
      expect(screen.getByText(/Không thành công/)).toBeInTheDocument());
    expect(screen.getAllByText(/Dịch vụ lưu trữ ảnh hiện chưa sẵn sàng/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Mã lỗi: EVENT_IMAGE_UPLOAD_UNAVAILABLE/)).toBeInTheDocument();
    expect(screen.queryByText(/Choose Files/i)).not.toBeInTheDocument();
  });

  it('labels the batch toolbar with queue counts and completion progress', async () => {
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText('Chọn ảnh thư viện'), [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]);
    expect(screen.getByRole('button', { name: 'Tải tất cả (2)' })).toBeInTheDocument();
    expect(screen.getByText('2 ảnh chờ tải · 0/2 đã tải thành công')).toBeInTheDocument();
  });   it('releases pending busy and exposes a retry affordance after a queue failure', async () => {
    const onBusyChange = vi.fn();
    vi.mocked(uploadAdminEventImage).mockRejectedValueOnce(
      new ApiRequestError('EVENT_IMAGE_INVALID_CONTENT', 'invalid', 400),
    );
    render(<Harness onBusyChange={onBusyChange} />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    // Batch settles: busy released, retry enabled.
    const retry = await screen.findByRole('button', { name: 'Thử lại ảnh này' });
    expect(retry).toBeEnabled();
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);

    // Stop button is hidden once the batch settles.
    expect(
      screen.queryByRole('button', { name: 'Dừng sau ảnh hiện tại' }),
    ).not.toBeInTheDocument();

    // Failure counter is visible and the batch label drops the busy copy.
    expect(
      screen.getByTestId('admin-gallery-failed-count'),
    ).toHaveTextContent(/1 ảnh không thành công/);
    expect(
      screen.getByTestId('admin-gallery-success-count'),
    ).toHaveTextContent(/0 ảnh chờ tải · 0\/1 đã tải thành công/);
    expect(
      screen.queryByRole('button', { name: /Đang tải/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the friendly published-guard message with expandable requirements on blocked upload', async () => {
    vi.mocked(uploadAdminEventImage).mockRejectedValueOnce(
      new ApiRequestError(
        'PUBLISHED_EVENT_WOULD_BECOME_INVALID',
        'unpublish first',
        409,
        [],
        [
          {
            code: 'MISSING_CORE_CONTENT',
            section: 'CONTENT',
            severity: 'ERROR',
            fields: ['canonicalSummary', 'detailedNarrative'],
          },
        ],
      ),
    );
    render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    await screen.findAllByText(/Sự kiện đang xuất bản chưa đáp ứng/);
    // The machine code is NOT shown as the primary line.
    expect(
      screen.queryByText(/Mã lỗi: PUBLISHED_EVENT_WOULD_BECOME_INVALID/),
    ).not.toBeInTheDocument();
    // The retry button is enabled and a "Xem chi tiết" summary is rendered.
    expect(screen.getByRole('button', { name: 'Thử lại ảnh này' })).toBeEnabled();
    const summary = screen.getByText(/Xem chi tiết \(1\)/);
    await userEvent.click(summary);
    expect(
      screen.getByText(/Thiếu nội dung cốt lõi/),
    ).toBeInTheDocument();
  });

  it('keeps retry semantics idempotent and accepts exactly one click per failure', async () => {
    vi.mocked(uploadAdminEventImage).mockRejectedValue(
      new ApiRequestError('EVENT_IMAGE_INVALID_CONTENT', 'invalid', 400),
    );
    const onBusyChange = vi.fn();
    render(<Harness onBusyChange={onBusyChange} />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));
    await screen.findByRole('button', { name: 'Thử lại ảnh này' });
    expect(uploadAdminEventImage).toHaveBeenCalledTimes(1);
  });

  it('handles a 401 by releasing pending lock and surfacing a friendly offline notice', async () => {
    vi.mocked(uploadAdminEventImage).mockRejectedValue(
      new ApiRequestError('UNAUTHENTICATED', 'session-expired', 401),
    );
    const onBusyChange = vi.fn();
    const onPersistentBlock = vi.fn();
    render(<Harness onBusyChange={onBusyChange} onPersistentBlock={onPersistentBlock} />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    // Reconciliation codes release busy via persistentBlock; we still need
    // busy=false and onBusyChange(false) regardless.
    await screen.findAllByText(/Phiên đăng nhập đã hết hạn/);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(onPersistentBlock).toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /Đang tải/ }),
    ).not.toBeInTheDocument();
  });

  it('handles a 503 by switching the capability to unavailable and exposing a retry affordance', async () => {
    vi.mocked(uploadAdminEventImage).mockRejectedValue(
      new ApiRequestError('EVENT_IMAGE_UPLOAD_UNAVAILABLE', 'unavailable', 503),
    );
    render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    // The banner appears in the unavailable state; the actionError line
    // also surfaces the friendly copy, so use findAllByText here.
    await screen.findAllByText(/Dịch vụ lưu trữ ảnh hiện chưa sẵn sàng/);
    expect(
      screen.getByRole('button', { name: 'Thử lại trạng thái' }),
    ).toBeInTheDocument();
  });

  it('hides the batch action after a fully successful batch and shows the success label', async () => {
    vi.mocked(uploadAdminEventImage).mockResolvedValue({
      mediaId: 11,
      updatedAt: version1,
      event: detail(version1, [media(11, '/api/admin-e2e/event-images/a')]),
    });
    render(<Harness />);
    await userEvent.upload(
      screen.getByLabelText('Chọn ảnh thư viện'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    );
    await userEvent.type(screen.getAllByLabelText(/Mô tả thay thế/)[1], 'Ảnh A');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (1)' }));

    // After full success the spec requires us to drop the "Tải tất cả (N)"
    // action entirely - it would otherwise look like an in-progress action.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Tải tất cả \(/ })).not.toBeInTheDocument());
    expect(screen.getByTestId('admin-gallery-settled-success'))
      .toHaveTextContent(/1\/1 ảnh đã tải thành công/);
    expect(screen.queryByRole('button', { name: 'Dừng sau ảnh hiện tại' }))
      .not.toBeInTheDocument();
    // The pending-counter hint stays so the operator still sees the ratio.
    expect(screen.getByTestId('admin-gallery-success-count'))
      .toHaveTextContent(/0 ảnh chờ tải · 1\/1 đã tải thành công/);
  });

  it('keeps the batch action visible when there are failed items even if some succeeded', async () => {
    vi.mocked(uploadAdminEventImage)
      .mockResolvedValueOnce({
        mediaId: 11,
        updatedAt: version1,
        event: detail(version1, [media(11, '/api/admin-e2e/event-images/a')]),
      })
      .mockRejectedValueOnce(new ApiRequestError('EVENT_IMAGE_INVALID_CONTENT', 'invalid', 400));
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText('Chọn ảnh thư viện'), [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]);
    const altFields = screen.getAllByLabelText(/Mô tả thay thế/);
    await userEvent.type(altFields[1], 'Ảnh A');
    await userEvent.type(altFields[2], 'Ảnh B');
    await userEvent.click(screen.getByRole('button', { name: 'Tải tất cả (2)' }));

    await screen.findByRole('button', { name: 'Thử lại ảnh này' });
    // While at least one item is still in a non-success terminal state, the
    // operator must still see "Tải tất cả" so they can retry the failed
    // subset. The button exists but is disabled until the operator clears
    // the failure first (the inline retry covers that path).
    expect(screen.getByRole('button', { name: 'Tải tất cả (0)' })).toBeInTheDocument();
    expect(screen.getByTestId('admin-gallery-failed-count'))
      .toHaveTextContent(/1 ảnh không thành công/);
    expect(screen.getByRole('button', { name: 'Xóa ảnh lỗi' })).toBeInTheDocument();
  });
});
