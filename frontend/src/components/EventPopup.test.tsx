import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HistoricalEvent } from '../types/event';
import type { TerrainViewModel } from '../types/terrain';
import EventPopup from './EventPopup';

const event: HistoricalEvent = {
  id: 'event-row-000123',
  slug: 'chien-dich-dien-bien-phu-1954',
  name: 'Chiến dịch Điện Biên Phủ',
  description: 'Chiến dịch quyết định trong cuộc kháng chiến chống thực dân Pháp.',
  startYear: 1954,
  endYear: 1954,
  effectiveEndYear: 1954,
  eventType: 'military',
  geoType: 'multi_point',
  parentId: 'khang-chien-chong-phap',
};

const parentEvent: HistoricalEvent = {
  ...event,
  id: 'khang-chien-chong-phap',
  slug: 'cuoc-khang-chien-chong-thuc-dan-phap',
  name: 'Cuộc kháng chiến chống thực dân Pháp',
  parentId: null,
};

const terrain: TerrainViewModel = {
  mode: 'active',
  providerStatus: 'ready',
  geometryStatus: 'ready',
  targets: [
    {
      id: 'him-lam',
      kind: 'point',
      label: 'Him Lam',
      position: { lat: 21.405, lng: 103.023 },
      sourceIndex: 0,
    },
    {
      id: 'doi-doc-lap',
      kind: 'point',
      label: 'Đồi Độc Lập',
      position: { lat: 21.458, lng: 103.002 },
      sourceIndex: 7,
    },
    {
      id: 'ban-keo',
      kind: 'point',
      label: 'Bản Kéo',
      position: { lat: 21.442, lng: 103.013 },
      sourceIndex: 3,
    },
    {
      id: 'muong-thanh',
      kind: 'point',
      label: 'Mường Thanh',
      position: { lat: 21.385, lng: 103.006 },
      sourceIndex: 2,
    },
  ],
  selectedTargetId: null,
  eligible: true,
  ineligibleReason: 'missing_map_data',
  error: null,
};

describe('EventPopup terrain layout', () => {
  it('labels multi_polygon from unique province names for the event and child rows', () => {
    const child = {
      ...event,
      id: 'sa-huynh',
      name: 'Văn hoá Sa Huỳnh',
      geoType: 'multi_polygon' as const,
      parentId: event.id,
      primaryRegions: ['Quảng Bình', ' Bình Thuận ', 'Quảng Bình'],
    };
    render(
      <EventPopup
        event={{ ...event, geoType: 'multi_polygon', primaryRegions: [' Quảng Nam '] , children: [child] }}
        parentEvent={null}
        onClose={vi.fn()}
        onNavigateToChild={vi.fn()}
        onNavigateToParent={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    expect(screen.getByText('Một vùng')).toBeInTheDocument();
    expect(screen.getByText(/Nhiều vùng/)).toBeInTheDocument();
  });

  it('keeps event content and tall active terrain controls in one scroll region', () => {
    const { container } = render(
      <EventPopup
        event={event}
        parentEvent={parentEvent}
        terrain={terrain}
        onClose={vi.fn()}
        onNavigateToChild={vi.fn()}
        onNavigateToParent={vi.fn()}
        onOpenTerrain={vi.fn()}
        onRetryTerrain={vi.fn()}
        onSelectTerrainTarget={vi.fn()}
        onShowTerrainOverview={vi.fn()}
        onExitTerrain={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    const scrollRegion = container.querySelector<HTMLElement>('.map-event-panel-scroll');
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion).toHaveStyle({ minHeight: '0', overflowY: 'auto' });

    const scrollContent = within(scrollRegion!);
    expect(scrollContent.getByText('Thời gian')).toBeInTheDocument();
    expect(scrollContent.getByRole('button', { name: 'Xem chi tiết' })).toBeInTheDocument();
    expect(scrollContent.getByRole('heading', { level: 3, name: 'Chiến dịch Điện Biên Phủ' })).toBeInTheDocument();
    expect(scrollContent.getByText(/Khám phá một số vị trí tiêu biểu/)).toBeInTheDocument();
    const learningList = scrollContent.getByRole('list', { name: 'Các địa điểm học tập tiêu biểu' });
    expect(within(learningList).getAllByRole('button')).toHaveLength(4);
    expect(within(learningList).queryByRole('button', { name: /^Điện Biên Phủ/ })).not.toBeInTheDocument();
    expect(scrollContent.queryByText(/Quan sát trên mô hình 3D/)).not.toBeInTheDocument();
    expect(scrollContent.queryByText(/phóng đại theo chiều đứng 2×/)).not.toBeInTheDocument();
    expect(scrollContent.getByRole('button', { name: 'Quay lại góc nhìn' })).toBeInTheDocument();
    expect(scrollContent.getByRole('button', { name: 'Quay lại' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Quay lại: Cuộc kháng chiến/ })).not.toBe(
      scrollContent.getByRole('button', { name: 'Quay lại' }),
    );
  });

  it('routes learning-row selection through the existing terrain callback', () => {
    const onSelectTerrainTarget = vi.fn();
    render(
      <EventPopup
        event={event}
        parentEvent={null}
        terrain={terrain}
        onClose={vi.fn()}
        onNavigateToChild={vi.fn()}
        onNavigateToParent={vi.fn()}
        onOpenTerrain={vi.fn()}
        onRetryTerrain={vi.fn()}
        onSelectTerrainTarget={onSelectTerrainTarget}
        onShowTerrainOverview={vi.fn()}
        onExitTerrain={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    const learningList = screen.getByRole('list', { name: 'Các địa điểm học tập tiêu biểu' });
    fireEvent.click(within(learningList).getByRole('button', { name: /Đồi Độc Lập/ }));
    expect(onSelectTerrainTarget).toHaveBeenCalledOnce();
    expect(onSelectTerrainTarget).toHaveBeenCalledWith('doi-doc-lap');
  });

  it('uses the specialized panel only for the exact canonical slug while active', () => {
    render(
      <EventPopup
        event={{ ...event, slug: 'chien-dich-dien-bien-phu-1954-copy' }}
        parentEvent={null}
        terrain={terrain}
        onClose={vi.fn()}
        onNavigateToChild={vi.fn()}
        onNavigateToParent={vi.fn()}
        onOpenTerrain={vi.fn()}
        onRetryTerrain={vi.fn()}
        onSelectTerrainTarget={vi.fn()}
        onShowTerrainOverview={vi.fn()}
        onExitTerrain={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Đang xem địa hình: Chiến dịch Điện Biên Phủ');
    expect(screen.queryByText(/Khám phá một số vị trí tiêu biểu/)).not.toBeInTheDocument();
    expect(screen.getByText(/Mô hình địa hình tham chiếu thời hiện đại/)).toBeInTheDocument();
  });

  it('keeps the existing pre-entry lifecycle and DBP CTA', () => {
    render(
      <EventPopup
        event={event}
        parentEvent={null}
        terrain={{ ...terrain, mode: 'idle' }}
        onClose={vi.fn()}
        onNavigateToChild={vi.fn()}
        onNavigateToParent={vi.fn()}
        onOpenTerrain={vi.fn()}
        onRetryTerrain={vi.fn()}
        onSelectTerrainTarget={vi.fn()}
        onShowTerrainOverview={vi.fn()}
        onExitTerrain={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Xem không gian diễn biến chiến dịch' })).toBeInTheDocument();
    expect(screen.queryByText(/Khám phá một số vị trí tiêu biểu/)).not.toBeInTheDocument();
  });

  it('explains no-location state and does not expose terrain controls', () => {
    render(
      <EventPopup
        event={{ ...event, geoType: 'no_location', coordinates: undefined }}
        parentEvent={null}
        terrain={terrain}
        onClose={vi.fn()}
        onNavigateToChild={vi.fn()}
        onNavigateToParent={vi.fn()}
        onOpenTerrain={vi.fn()}
        onRetryTerrain={vi.fn()}
        onSelectTerrainTarget={vi.fn()}
        onShowTerrainOverview={vi.fn()}
        onExitTerrain={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    expect(screen.getByText(
      'Chưa có địa điểm đủ tin cậy để hiển thị sự kiện này trên bản đồ.',
    )).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /địa hình/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quay lại góc nhìn' })).not.toBeInTheDocument();
  });

  it('keeps the summary visible and reports a detail hydration error', () => {
    render(
      <EventPopup
        event={event}
        detailStatus="error"
        parentEvent={null}
        onClose={vi.fn()}
        onNavigateToChild={vi.fn()}
        onNavigateToParent={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: event.name })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa tải được nội dung chi tiết');
  });
});
