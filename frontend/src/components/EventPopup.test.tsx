import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HistoricalEvent } from '../types/event';
import type { TerrainViewModel } from '../types/terrain';
import EventPopup from './EventPopup';

const event: HistoricalEvent = {
  id: 'dien-bien-phu',
  slug: 'chien-dich-dien-bien-phu-1954',
  name: 'Chiến dịch Điện Biên Phủ',
  description: 'Chiến dịch quyết định trong cuộc kháng chiến chống thực dân Pháp.',
  startYear: 1954,
  endYear: 1954,
  effectiveEndYear: 1954,
  eventType: 'military',
  geoType: 'multi_polygon',
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
  ],
  selectedTargetId: 'him-lam',
  eligible: true,
  ineligibleReason: 'missing_map_data',
  error: null,
};

describe('EventPopup terrain layout', () => {
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
    expect(scrollContent.getByRole('status')).toHaveTextContent('Đang xem địa hình: Chiến dịch Điện Biên Phủ');
    expect(scrollContent.getByRole('button', { name: 'Quay lại góc nhìn' })).toBeInTheDocument();
    expect(scrollContent.getByRole('button', { name: 'Quay lại' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Quay lại: Cuộc kháng chiến/ })).not.toBe(
      scrollContent.getByRole('button', { name: 'Quay lại' }),
    );
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
