import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEventMediaSection from '../AdminEventMediaSection';
import {
  addAdminEventMedia,
  removeAdminEventMedia,
  reorderAdminEventMedia,
  replaceAdminEventImage,
  selectAdminEventThumbnail,
  updateAdminEventMedia,
  type AdminEventDetail,
} from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    addAdminEventMedia: vi.fn(),
    updateAdminEventMedia: vi.fn(),
    removeAdminEventMedia: vi.fn(),
    reorderAdminEventMedia: vi.fn(),
    replaceAdminEventImage: vi.fn(),
    selectAdminEventThumbnail: vi.fn(),
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

const detail = {
  publication: { updatedAt: '2026-07-25T01:02:03.123456Z' },
  media: {
    activeCount: 1,
    thumbnail: null,
    items: [{
      id: 7, mediaType: 'image', url: null, urlSafe: false,
      caption: 'Legacy', altText: null, sourceName: null, license: null,
      storageType: 'local', managed: false, thumbnail: false, sortOrder: 0, status: 'active',
      createdAt: '2026-07-25T00:00:00Z',
    }],
  },
} as unknown as AdminEventDetail;

const safeDetail = {
  ...detail,
  media: {
    activeCount: 2,
    thumbnail: null,
    items: [
      {
        id: 1, mediaType: 'image', url: 'https://cdn.example.org/one.jpg', urlSafe: true,
        caption: 'One', altText: 'One image', sourceName: 'Museum', license: 'CC BY',
        storageType: 'external', managed: false, thumbnail: false, sortOrder: 0, status: 'active',
        createdAt: '2026-07-25T00:00:00Z',
      },
      {
        id: 2, mediaType: 'image', url: 'https://cdn.example.org/two.jpg', urlSafe: true,
        caption: null, altText: null, sourceName: null, license: null,
        storageType: 'object_storage', managed: true, thumbnail: false, sortOrder: 1, status: 'hidden',
        createdAt: '2026-07-25T00:00:00Z',
      },
    ],
  },
} as unknown as AdminEventDetail;

describe('AdminEventMediaSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redacts an unsafe legacy URL and sends the opaque version when adding metadata', async () => {
    vi.mocked(addAdminEventMedia).mockResolvedValue(detail);
    render(<AdminEventMediaSection eventId="event-1" detail={detail}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    expect(screen.getByText('URL không an toàn đã ẩn')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('URL media'), 'https://cdn.example.org/image.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm media' }));

    expect(addAdminEventMedia).toHaveBeenCalledWith('event-1', expect.objectContaining({
      expectedUpdatedAt: '2026-07-25T01:02:03.123456Z',
      url: 'https://cdn.example.org/image.jpg',
    }));
  });

  it('requires confirmation before removing the database row', async () => {
    render(<AdminEventMediaSection eventId="event-1" detail={detail}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xóa khỏi sự kiện' }));
    const dialog = screen.getByRole('dialog', { name: 'Xóa media khỏi sự kiện?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(removeAdminEventMedia).not.toHaveBeenCalled();
  });

  it('renders the empty state with image upload controls but no geography or raw JSON controls', () => {
    render(<AdminEventMediaSection eventId="event-1"
      detail={{ ...detail, media: { activeCount: 0, thumbnail: null, items: [] } }}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    expect(screen.getByText('Chưa có media.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn ảnh đại diện')).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn ảnh thư viện')).toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mapData/i)).not.toBeInTheDocument();
  });

  it('patches all editable metadata without exposing server-owned fields', async () => {
    vi.mocked(updateAdminEventMedia).mockResolvedValue(safeDetail);
    render(<AdminEventMediaSection eventId="event-1" detail={safeDetail}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Sửa' })[0]);
    await userEvent.clear(screen.getByLabelText('Chú thích media 1'));
    await userEvent.type(screen.getByLabelText('Chú thích media 1'), 'Updated');
    await userEvent.clear(screen.getByLabelText('Nguồn media 1'));
    await userEvent.type(screen.getByLabelText('Nguồn media 1'), 'Archive');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu media' }));

    await waitFor(() => expect(updateAdminEventMedia).toHaveBeenCalledWith(
      'event-1',
      1,
      expect.objectContaining({
        expectedUpdatedAt: '2026-07-25T01:02:03.123456Z',
        url: 'https://cdn.example.org/one.jpg',
        caption: 'Updated',
        sourceName: 'Archive',
        status: 'active',
      }),
    ));
    const payload = vi.mocked(updateAdminEventMedia).mock.calls[0][2] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('eventId');
    expect(payload).not.toHaveProperty('storageType');
    expect(payload).not.toHaveProperty('sortOrder');
    expect(payload).not.toHaveProperty('thumbnail');
  });

  it('labels managed media and keeps its URL, type and storage identity immutable', async () => {
    vi.mocked(updateAdminEventMedia).mockResolvedValue(safeDetail);
    render(<AdminEventMediaSection eventId="event-1" detail={safeDetail}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    expect(screen.getByText(/Ảnh được quản lý/)).toBeInTheDocument();
    expect(screen.getByText(/Liên kết ngoài/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Sửa' })[1]);
    expect(screen.queryByLabelText('URL media 2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loại media 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Trạng thái media 2')).not.toHaveTextContent('missing');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu media' }));

    const payload = vi.mocked(updateAdminEventMedia).mock.calls[0][2] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty('url');
    expect(payload).not.toHaveProperty('mediaType');
    expect(payload).not.toHaveProperty('storageType');
  });

  it('explains asynchronous cleanup before removing managed media', async () => {
    render(<AdminEventMediaSection eventId="event-1" detail={safeDetail}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa khỏi sự kiện' })[1]);
    expect(screen.getByRole('dialog', { name: 'Xóa media khỏi sự kiện?' }))
      .toHaveTextContent(/dọn tệp trên dịch vụ lưu trữ có thể hoàn tất bất đồng bộ/);
  });

  it('offers replacement only for active managed images and sends the current version once confirmed', async () => {
    const activeManaged = {
      ...safeDetail,
      media: {
        ...safeDetail.media,
        items: [{ ...safeDetail.media.items[1], status: 'active' }],
      },
    } as AdminEventDetail;
    vi.mocked(replaceAdminEventImage).mockResolvedValue({
      mediaId: 2,
      updatedAt: '2026-07-25T01:02:04.123456Z',
      event: activeManaged,
    });
    render(<AdminEventMediaSection eventId="event-1" detail={activeManaged}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thay asset' }));
    const dialog = screen.getByRole('dialog', { name: 'Thay asset managed?' });
    const file = new File(['replacement'], 'replacement.png', { type: 'image/png' });
    await userEvent.upload(within(dialog).getByLabelText('Chọn asset mới'), file);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thay asset' }));

    await waitFor(() => expect(replaceAdminEventImage).toHaveBeenCalledWith('event-1', 2,
      expect.objectContaining({ file, expectedUpdatedAt: '2026-07-25T01:02:03.123456Z' })));
  });

  it('accepts a WebP file for managed asset replacement', async () => {
    const activeManaged = {
      ...safeDetail,
      media: {
        ...safeDetail.media,
        items: [{ ...safeDetail.media.items[1], status: 'active' }],
      },
    } as AdminEventDetail;
    vi.mocked(replaceAdminEventImage).mockResolvedValue({
      mediaId: 2,
      updatedAt: '2026-07-25T01:02:04.123456Z',
      event: activeManaged,
    });
    render(<AdminEventMediaSection eventId="event-1" detail={activeManaged}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thay asset' }));
    const dialog = screen.getByRole('dialog', { name: 'Thay asset managed?' });
    const file = new File(['replacement'], 'replacement.webp', { type: 'image/webp' });
    await userEvent.upload(within(dialog).getByLabelText('Chọn asset mới'), file);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thay asset' }));

    await waitFor(() => expect(replaceAdminEventImage).toHaveBeenCalledWith('event-1', 2,
      expect.objectContaining({ file, expectedUpdatedAt: '2026-07-25T01:02:03.123456Z' })));
  });

  it('rejects non-image replacement files with a clear message', async () => {
    const activeManaged = {
      ...safeDetail,
      media: {
        ...safeDetail.media,
        items: [{ ...safeDetail.media.items[1], status: 'active' }],
      },
    } as AdminEventDetail;
    render(<AdminEventMediaSection eventId="event-1" detail={activeManaged}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Thay asset' }));
    const dialog = screen.getByRole('dialog', { name: 'Thay asset managed?' });
    // fireEvent bypasses the accept attribute so the component's own MIME
    // validation is exercised (user-event's upload honours accept and drops the file).
    fireEvent.change(within(dialog).getByLabelText('Chọn asset mới'), {
      target: { files: [new File(['gif'], 'anim.gif', { type: 'image/gif' })] },
    });
    expect(screen.getByText(/Chỉ hỗ trợ ảnh JPEG\/PNG\/WebP hợp lệ/)).toBeInTheDocument();
  });

  it('forwards exact versions for reorder, thumbnail selection and confirmed removal', async () => {
    const afterReorder = {
      ...safeDetail,
      publication: { updatedAt: '2026-07-25T01:02:04.123456Z' },
    } as AdminEventDetail;
    const afterThumbnail = {
      ...safeDetail,
      publication: { updatedAt: '2026-07-25T01:02:05.123456Z' },
    } as AdminEventDetail;
    vi.mocked(reorderAdminEventMedia).mockResolvedValue(afterReorder);
    vi.mocked(selectAdminEventThumbnail).mockResolvedValue(afterThumbnail);
    vi.mocked(removeAdminEventMedia).mockResolvedValue(safeDetail);
    render(<AdminEventMediaSection eventId="event-1" detail={safeDetail}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={vi.fn()} />);

    await userEvent.click(screen.getAllByLabelText('Di chuyển xuống')[0]);
    await waitFor(() => expect(reorderAdminEventMedia).toHaveBeenCalledWith(
      'event-1', '2026-07-25T01:02:03.123456Z', [2, 1],
    ));

    await userEvent.click(screen.getAllByRole('button', { name: 'Chọn thumbnail' })[0]);
    await waitFor(() => expect(selectAdminEventThumbnail).toHaveBeenCalledWith(
      'event-1', 1, '2026-07-25T01:02:04.123456Z',
    ));

    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa khỏi sự kiện' })[0]);
    await userEvent.click(within(screen.getByRole('dialog', {
      name: 'Xóa media khỏi sự kiện?',
    })).getByRole('button', { name: 'Xóa khỏi sự kiện' }));
    await waitFor(() => expect(removeAdminEventMedia).toHaveBeenCalledWith(
      'event-1', 1, '2026-07-25T01:02:05.123456Z',
    ));
  });

  it('reports API errors and invokes conflict reload without replaying the mutation', async () => {
    const onConflict = vi.fn();
    vi.mocked(addAdminEventMedia).mockRejectedValue(
      new ApiRequestError('EVENT_UPDATE_CONFLICT', 'Conflict', 409),
    );
    render(<AdminEventMediaSection eventId="event-1" detail={detail}
      version="2026-07-25T01:02:03.123456Z" onUpdated={vi.fn()} onConflict={onConflict} />);

    await userEvent.type(screen.getByLabelText('URL media'), 'https://cdn.example.org/new.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm media' }));

    expect(await screen.findByText('Conflict')).toHaveAttribute('role', 'alert');
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(addAdminEventMedia).toHaveBeenCalledTimes(1);
  });

  it('disables every media mutation while the shared page lock is active', () => {
    render(<AdminEventMediaSection eventId="event-1" detail={safeDetail}
      version="2026-07-25T01:02:03.123456Z" disabled
      onUpdated={vi.fn()} onConflict={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Thêm media' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Sửa' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Chọn thumbnail' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Xóa khỏi sự kiện' })[0]).toBeDisabled();
  });
});
