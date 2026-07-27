import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEventEditorPage from '../AdminEventEditorPage';
import {
  addAdminEventMedia,
  getAdminEventDetail,
  replaceAdminEventGrades,
  updateAdminEventCore,
  updateAdminEventPublication,
  type AdminEventDetail,
} from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return {
    ...actual,
    getAdminEventDetail: vi.fn(),
    updateAdminEventCore: vi.fn(),
    replaceAdminEventGrades: vi.fn(),
    createAdminEvent: vi.fn(),
    addAdminEventMedia: vi.fn(),
    updateAdminEventPublication: vi.fn(),
  };
});

const version = '2026-07-24T17:20:30.123456Z';
const nextVersion = '2026-07-24T17:20:31.654321Z';
const detail: AdminEventDetail = {
  core: { id: 'event-1', slug: 'event-1', title: 'Sự kiện', shortTitle: null },
  content: { cardSummary: null, canonicalSummary: null, detailedNarrative: null, significance: null, keyFacts: [] },
  chronology: { startYear: null, endYear: null, effectiveEndYear: null, displayDate: null, datePrecision: null },
  classification: { eventLevel: 'atomic', eventType: 'political', eventSubtype: null, grades: [10] },
  publication: {
    status: 'draft',
    flags: { showOnHomepage: false, showOnTimeline: false, featured: false },
    publishedAt: null,
    createdAt: '2026-07-24T17:00:00Z',
    updatedAt: version,
  },
  media: { thumbnail: null, items: [], activeCount: 0 },
  geography: {
    normalizedGeoType: 'no_location', canonicalGeoType: 'no_location',
    lat: null, lng: null, provinceNames: [], historicalLocations: [], mapData: null,
  },
  hierarchy: { parent: null, root: null, children: [], relations: [] },
  textbook: { visibleReferences: [], totalReferenceCount: 0, visibleReferenceCount: 0, hasTextbookContent: false },
  externalSources: [],
  completeness: { complete: false, issueCount: 1, issues: [] },
};

function renderEditor() {
  const router = createMemoryRouter(
    [{ path: '/admin/events/:id/edit', element: <AdminEventEditorPage /> }],
    { initialEntries: ['/admin/events/event-1/edit'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AdminEventEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminEventDetail).mockResolvedValue(detail);
    vi.mocked(updateAdminEventCore).mockResolvedValue({
      ...detail,
      publication: { ...detail.publication, updatedAt: nextVersion },
    });
    vi.mocked(replaceAdminEventGrades).mockResolvedValue(detail);
    vi.mocked(updateAdminEventPublication).mockResolvedValue({
      ...detail,
      publication: {
        ...detail.publication,
        status: 'published',
        publishedAt: '2026-07-24T17:30:00Z',
        updatedAt: nextVersion,
      },
    });
  });

  it('preserves the six-digit opaque version and keeps core and grade saves independent', async () => {
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    fireEvent.change(screen.getByDisplayValue('Sự kiện'), { target: { value: 'Sự kiện mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nội dung' }));

    await waitFor(() => expect(updateAdminEventCore).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ expectedUpdatedAt: version, title: 'Sự kiện mới' }),
    ));
    expect(replaceAdminEventGrades).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Lớp 11'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu khối lớp' }));
    await waitFor(() => expect(replaceAdminEventGrades).toHaveBeenCalledWith(
      'event-1', { expectedUpdatedAt: nextVersion, grades: [10, 11] },
    ));
  });

  it('disables both mutation actions while either section save is in flight', async () => {
    let releaseCore!: (value: AdminEventDetail) => void;
    vi.mocked(updateAdminEventCore).mockImplementation(
      () => new Promise(resolve => { releaseCore = resolve; }),
    );
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    fireEvent.change(screen.getByDisplayValue('Sự kiện'), { target: { value: 'Sự kiện mới' } });
    fireEvent.click(screen.getByLabelText('Lớp 11'));
    const coreButton = screen.getByRole('button', { name: 'Lưu nội dung' });
    const gradeButton = screen.getByRole('button', { name: 'Lưu khối lớp' });

    fireEvent.click(coreButton);
    await waitFor(() => expect(coreButton).toBeDisabled());
    expect(gradeButton).toBeDisabled();
    expect(replaceAdminEventGrades).not.toHaveBeenCalled();

    releaseCore({
      ...detail,
      publication: { ...detail.publication, updatedAt: nextVersion },
    });
    await waitFor(() => expect(gradeButton).not.toBeDisabled());
    expect(coreButton).toBeDisabled();
  });

  it('surfaces optimistic conflicts and never automatically overwrites', async () => {
    vi.mocked(updateAdminEventCore).mockRejectedValue(
      new ApiRequestError('EVENT_UPDATE_CONFLICT', 'Conflict', 409),
    );
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    fireEvent.change(screen.getByDisplayValue('Sự kiện'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nội dung' }));

    expect(await screen.findByText(/đã thay đổi ở nơi khác/i)).toBeInTheDocument();
    expect(updateAdminEventCore).toHaveBeenCalledTimes(1);
  });

  it('asks the admin to unpublish before a mutation that would invalidate a published event', async () => {
    vi.mocked(updateAdminEventCore).mockRejectedValue(
      new ApiRequestError(
        'PUBLISHED_EVENT_WOULD_BECOME_INVALID',
        'Backend detail must not be the only actionable guidance',
        409,
      ),
    );
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    fireEvent.change(screen.getByDisplayValue('Sự kiện'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nội dung' }));

    expect(await screen.findByText(/gỡ xuất bản trước khi thực hiện thay đổi/i))
      .toBeInTheDocument();
    expect(updateAdminEventCore).toHaveBeenCalledTimes(1);
  });

  it('renders unknown chronology, typed publication actions and no hard-delete control', async () => {
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    expect(screen.getByLabelText('Năm bắt đầu')).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Xuất bản' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Lưu trữ' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /xóa sự kiện/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Không có trình sửa raw JSON/i)).toBeInTheDocument();
  });

  it('disables publication for dirty core, grades, media or geography forms', async () => {
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    const publish = screen.getByRole('button', { name: 'Xuất bản' });
    expect(publish).toBeEnabled();

    fireEvent.change(screen.getByDisplayValue('Sự kiện'), { target: { value: 'Changed' } });
    expect(publish).toBeDisabled();
    expect(screen.getByText(/Hãy lưu hoặc hủy mọi thay đổi/i)).toBeInTheDocument();
  });

  it('includes publication in the shared page-level mutation lock and replaces the exact version', async () => {
    let releasePublication!: (value: AdminEventDetail) => void;
    vi.mocked(updateAdminEventPublication).mockImplementation(
      () => new Promise(resolve => { releasePublication = resolve; }),
    );
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất bản' }));
    fireEvent.change(screen.getByDisplayValue('Sự kiện'), { target: { value: 'Changed while publishing' } });
    expect(screen.getByRole('button', { name: 'Lưu nội dung' })).toBeDisabled();
    expect(updateAdminEventPublication).toHaveBeenCalledWith(
      'event-1',
      { expectedUpdatedAt: version, action: 'publish' },
      expect.any(AbortSignal),
    );

    releasePublication({
      ...detail,
      publication: { ...detail.publication, status: 'published', updatedAt: nextVersion },
    });
    await waitFor(() => expect(screen.getByText(/Trạng thái hiện tại: published/)).toBeInTheDocument());
  });

  it('shares the page mutation lock while a media save is in flight', async () => {
    let releaseMedia!: (value: AdminEventDetail) => void;
    vi.mocked(addAdminEventMedia).mockImplementation(
      () => new Promise(resolve => { releaseMedia = resolve; }),
    );
    renderEditor();
    await screen.findByDisplayValue('Sự kiện');
    fireEvent.change(screen.getByDisplayValue('Sự kiện'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByLabelText('Lớp 11'));
    fireEvent.change(screen.getByLabelText('URL media'), {
      target: { value: 'https://cdn.example.org/new.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm media' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu nội dung' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Lưu khối lớp' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thêm media' })).toBeDisabled();
    expect(updateAdminEventCore).not.toHaveBeenCalled();
    expect(replaceAdminEventGrades).not.toHaveBeenCalled();

    releaseMedia({
      ...detail,
      publication: { ...detail.publication, updatedAt: nextVersion },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu nội dung' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nội dung' }));
    await waitFor(() => expect(updateAdminEventCore).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ expectedUpdatedAt: nextVersion }),
    ));
  });

  it('renders loading and read errors without showing an empty media state prematurely', async () => {
    let rejectLoad!: (reason: unknown) => void;
    vi.mocked(getAdminEventDetail).mockImplementation(
      () => new Promise((_resolve, reject) => { rejectLoad = reject; }),
    );
    renderEditor();
    expect(screen.getByText(/Đang tải sự kiện/i)).toBeInTheDocument();
    expect(screen.queryByText('Chưa có media.')).not.toBeInTheDocument();

    rejectLoad(new Error('Read failed'));
    expect(await screen.findByText('Read failed')).toBeInTheDocument();
  });
});
