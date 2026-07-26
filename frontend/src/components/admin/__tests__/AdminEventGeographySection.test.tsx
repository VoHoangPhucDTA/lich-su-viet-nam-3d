import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEventGeographySection from '../AdminEventGeographySection';
import {
  updateAdminEventGeography,
  type AdminEventDetail,
} from '../../../services/adminApi';
import { ApiRequestError } from '../../../services/apiClient';

vi.mock('../../../services/adminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/adminApi')>(
    '../../../services/adminApi',
  );
  return { ...actual, updateAdminEventGeography: vi.fn() };
});

const version = '2026-07-24T17:20:30.123456Z';
const nextVersion = '2026-07-24T17:20:31.654321Z';
const detail: AdminEventDetail = {
  core: { id: 'event-1', slug: 'event-1', title: 'Sự kiện', shortTitle: null },
  content: {
    cardSummary: 'Card', canonicalSummary: 'Summary',
    detailedNarrative: 'Narrative', significance: 'Significance', keyFacts: ['Fact'],
  },
  chronology: {
    startYear: null, endYear: null, effectiveEndYear: null,
    displayDate: null, datePrecision: null,
  },
  classification: {
    eventLevel: 'atomic', eventType: 'political', eventSubtype: null, grades: [10],
  },
  publication: {
    status: 'draft',
    flags: { showOnHomepage: false, showOnTimeline: false, featured: false },
    publishedAt: null, createdAt: '2026-07-24T17:00:00Z', updatedAt: version,
  },
  media: { thumbnail: null, items: [], activeCount: 0 },
  geography: {
    normalizedGeoType: 'point', canonicalGeoType: 'point',
    lat: 16.46, lng: 107.59, provinceNames: [], historicalLocations: ['Phú Xuân'],
    mapData: {
      geoType: 'point',
      marker: { label: 'Huế', lat: 16.46, lng: 107.59 },
      markers: [], provinceNames: [], historicalLocations: ['Phú Xuân'], gadmRefs: [],
      displayGeometry: null,
      focusGeometry: {
        mode: 'point', zoom: 8, center: { lat: 16.46, lng: 107.59 }, provinceNames: [],
      },
    },
  },
  hierarchy: { parent: null, root: null, children: [], relations: [] },
  textbook: {
    visibleReferences: [], totalReferenceCount: 0,
    visibleReferenceCount: 0, hasTextbookContent: false,
  },
  externalSources: [],
  completeness: { complete: true, issueCount: 0, issues: [] },
};

function renderSection(props: Partial<React.ComponentProps<typeof AdminEventGeographySection>> = {}) {
  const onUpdated = vi.fn();
  const onConflict = vi.fn();
  const onBusyChange = vi.fn();
  const onDirtyChange = vi.fn();
  render(
    <MemoryRouter>
      <AdminEventGeographySection
        eventId="event-1"
        detail={detail}
        version={version}
        onUpdated={onUpdated}
        onConflict={onConflict}
        onBusyChange={onBusyChange}
        onDirtyChange={onDirtyChange}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onUpdated, onConflict, onBusyChange, onDirtyChange };
}

describe('AdminEventGeographySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          { properties: { GID_1: 'VNM.27_1', NAME_1: 'HàNội' } },
          { properties: { GID_1: 'VNM.54_1', NAME_1: 'ThừaThiênHuế' } },
        ],
      }),
    }));
    vi.mocked(updateAdminEventGeography).mockResolvedValue({
      ...detail,
      publication: { ...detail.publication, updatedAt: nextVersion },
    });
  });

  it('renders conditional structured forms without raw JSON, GeoJSON or Cesium controls', async () => {
    renderSection();
    expect(screen.getByLabelText('Vĩ độ marker 1')).toHaveValue(16.46);
    expect(screen.queryByLabelText('Thêm vùng')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /raw json/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/GeoJSON upload/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cesium drawing/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở bản đồ hiện có' }))
      .toHaveAttribute('href', '/map?event=event-1');

    fireEvent.change(screen.getByLabelText('Loại địa lý'), {
      target: { value: 'multi_polygon' },
    });
    expect(await screen.findByLabelText('Thêm vùng')).toBeInTheDocument();
    expect(screen.queryByLabelText('Vĩ độ marker 1')).not.toBeInTheDocument();
    expect(screen.getByText(/loại bỏ dữ liệu không tương thích: marker/i)).toBeInTheDocument();
  });

  it('edits ordered markers and forwards the exact opaque version', async () => {
    const callbacks = renderSection();
    fireEvent.change(screen.getByLabelText('Loại địa lý'), {
      target: { value: 'multi_point' },
    });
    fireEvent.change(screen.getByLabelText('Tên marker 2'), { target: { value: 'Hà Nội' } });
    fireEvent.change(screen.getByLabelText('Vĩ độ marker 2'), { target: { value: '21.028511' } });
    fireEvent.change(screen.getByLabelText('Kinh độ marker 2'), { target: { value: '105.804817' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu địa lý' }));

    await waitFor(() => expect(updateAdminEventGeography).toHaveBeenCalledWith(
      'event-1',
      {
        expectedUpdatedAt: version,
        geography: expect.objectContaining({
          geoType: 'multi_point',
          markers: [
            expect.objectContaining({ lat: 16.46, lng: 107.59 }),
            expect.objectContaining({ lat: 21.028511, lng: 105.804817 }),
          ],
        }),
      },
    ));
    expect(callbacks.onBusyChange).toHaveBeenNthCalledWith(1, true);
    expect(callbacks.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onUpdated).toHaveBeenCalledWith(expect.objectContaining({
      publication: expect.objectContaining({ updatedAt: nextVersion }),
    }));
  });

  it('adds approved regions and renders resolved preview labels', async () => {
    renderSection();
    fireEvent.change(screen.getByLabelText('Loại địa lý'), {
      target: { value: 'multi_polygon' },
    });
    await waitFor(() => expect(screen.getByRole('option', { name: /HàNội/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Thêm vùng'), { target: { value: 'VNM.27_1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vùng' }));
    expect(screen.getAllByText(/HàNội/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu địa lý' }));
    await waitFor(() => expect(updateAdminEventGeography).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        geography: expect.objectContaining({
          geoType: 'multi_polygon',
          regions: [{ gadmRef: 'VNM.27_1' }],
        }),
      }),
    ));
  });

  it('honors the shared lock and exposes optimistic conflict reload', async () => {
    const locked = renderSection({ disabled: true });
    fireEvent.change(screen.getByLabelText('Địa danh lịch sử'), {
      target: { value: 'Phú Xuân\nThuận Hóa' },
    });
    expect(screen.getByRole('button', { name: 'Lưu địa lý' })).toBeDisabled();
    expect(updateAdminEventGeography).not.toHaveBeenCalled();
    expect(locked.onDirtyChange).toHaveBeenCalledWith(true);

    vi.mocked(updateAdminEventGeography).mockRejectedValue(
      new ApiRequestError('EVENT_UPDATE_CONFLICT', 'Conflict', 409),
    );
    const callbacks = renderSection();
    fireEvent.change(screen.getAllByLabelText('Địa danh lịch sử')[1], {
      target: { value: 'Thuận Hóa' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Lưu địa lý' })[1]);
    await waitFor(() => expect(callbacks.onConflict).toHaveBeenCalledTimes(1));
    expect(updateAdminEventGeography).toHaveBeenCalledTimes(1);
  });
});
