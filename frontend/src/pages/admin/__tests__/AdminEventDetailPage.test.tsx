import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEventDetailPage from '../AdminEventDetailPage';
import { getAdminEventDetail, type AdminEventDetail } from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../layouts/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>('../../../services/adminApi');
  return { ...actual, getAdminEventDetail: vi.fn() };
});

const detail: AdminEventDetail = {
  core: { id: 'event-1', slug: 'bach-dang-938', title: 'Chiến thắng Bạch Đằng', shortTitle: 'Bạch Đằng' },
  content: {
    cardSummary: 'Tóm tắt an toàn',
    canonicalSummary: 'Tóm tắt chuẩn',
    detailedNarrative: 'Nội dung chi tiết',
    significance: 'Ý nghĩa',
    keyFacts: ['Sự kiện thứ nhất'],
  },
  chronology: {
    startYear: 938,
    endYear: null,
    effectiveEndYear: 938,
    displayDate: null,
    datePrecision: 'year',
  },
  classification: { eventLevel: 'atomic', eventType: 'military', eventSubtype: null, grades: [10] },
  publication: {
    status: 'published',
    flags: { showOnHomepage: true, showOnTimeline: true, featured: false },
    publishedAt: '2026-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  media: {
    thumbnail: { id: 1, url: 'https://cdn.example/bach-dang.jpg', altText: 'Bạch Đằng' },
    items: [{
      id: 1,
      mediaType: 'image',
      url: 'https://cdn.example/bach-dang.jpg',
      caption: 'Bạch Đằng',
      altText: 'Bạch Đằng',
      sourceName: 'Nguồn công khai',
      license: null,
      storageType: 'external',
      thumbnail: true,
      sortOrder: 0,
      status: 'active',
      createdAt: '2025-01-01T00:00:00Z',
    }],
    activeCount: 1,
  },
  geography: {
    normalizedGeoType: 'single_point',
    canonicalGeoType: 'point',
    lat: 20.9,
    lng: 106.7,
    provinceNames: ['Quảng Ninh'],
    historicalLocations: ['Sông Bạch Đằng'],
    mapData: {
      geoType: 'point',
      marker: { name: 'Bạch Đằng', lat: 20.9, lng: 106.7 },
      markers: [],
      provinceNames: ['Quảng Ninh'],
      historicalLocations: ['Sông Bạch Đằng'],
      gadmRefs: ['VNM.43_1'],
      displayGeometry: null,
      focusGeometry: null,
    },
  },
  hierarchy: { parent: null, root: null, children: [], relations: [] },
  textbook: {
    visibleReferences: [{
      id: 120272,
      grade: 10,
      book: 'Lịch sử 10',
      theme: null,
      lesson: 'Bài 1',
      pageStart: 12,
      pageEnd: 13,
      excerpt: 'Đoạn trích an toàn',
      url: 'https://example.edu/ref',
    }],
    totalReferenceCount: 2,
    visibleReferenceCount: 1,
    hasTextbookContent: true,
  },
  externalSources: [{
    sourceType: 'web',
    title: 'Nguồn công khai',
    canonicalUri: 'https://example.edu/source',
    externalId: null,
    language: 'vi',
    sourceOrder: 0,
    matchType: 'manual',
    primary: true,
    verificationStatus: 'verified',
  }],
  completeness: { complete: true, issueCount: 0, issues: [] },
};

describe('AdminEventDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminEventDetail).mockResolvedValue(detail);
  });

  function EditLocationProbe() {
    const location = useLocation();
    return <p data-testid="edit-return">{(location.state as { from?: string } | null)?.from}</p>;
  }

  const renderPage = () => render(
    <MemoryRouter initialEntries={[{ pathname: '/admin/events/event-1', state: { from: '/admin/events?status=draft' } }]}>
      <Routes>
        <Route path="/admin/events/:id" element={<AdminEventDetailPage />} />
        <Route path="/admin/events/:id/edit" element={<EditLocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );

  it('renders loading and all aggregate read-only sections', async () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải chi tiết');
    expect(await screen.findByRole('heading', { name: 'Chiến thắng Bạch Đằng' })).toBeInTheDocument();
    for (const heading of [
      'Thông tin cốt lõi',
      'Chẩn đoán độ đầy đủ',
      'Nội dung',
      'Xuất bản',
      'Ảnh đại diện và media',
      'Địa lý và dữ liệu bản đồ',
      'Phân cấp và quan hệ',
      'Tham chiếu giáo khoa',
      'Nguồn ngoài an toàn',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText('938')).toBeInTheDocument();
    expect(screen.getByText(/1\/2 tham chiếu hiển thị/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Quay lại danh sách' }))
      .toHaveAttribute('href', '/admin/events?status=draft');
    expect(screen.getByRole('link', { name: 'Chỉnh sửa' }))
      .toHaveAttribute('href', '/admin/events/event-1/edit');
    fireEvent.click(screen.getByRole('link', { name: 'Chỉnh sửa' }));
    expect(screen.getByTestId('edit-return')).toHaveTextContent('/admin/events?status=draft');
    expect(getAdminEventDetail).toHaveBeenCalledWith('event-1', expect.any(AbortSignal));
  });

  it('renders diagnostics without exposing raw or internal provenance fields', async () => {
    vi.mocked(getAdminEventDetail).mockResolvedValue({
      ...detail,
      completeness: {
        complete: false,
        issueCount: 1,
        issues: [{ code: 'INVALID_MAP_DATA', section: 'geography', severity: 'ERROR', fields: ['mapData'] }],
      },
    });
    const { container } = renderPage();
    expect(await screen.findByText('INVALID_MAP_DATA')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('raw_json');
    expect(container).not.toHaveTextContent('sourceJson');
    expect(container).not.toHaveTextContent('local:');
  });

  it('renders an authorization state for forbidden API responses', async () => {
    vi.mocked(getAdminEventDetail).mockRejectedValue(new ApiRequestError('FORBIDDEN', 'internal', 403));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền');
  });

  it('retries after an API failure', async () => {
    vi.mocked(getAdminEventDetail)
      .mockRejectedValueOnce(new Error('detail unavailable'))
      .mockResolvedValueOnce(detail);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('detail unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Chiến thắng Bạch Đằng')).toBeInTheDocument());
    expect(getAdminEventDetail).toHaveBeenCalledTimes(2);
  });
});
