import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from '../../types/event';
import { VIETNAM_2026_34_LAYER_ID } from '../../utils/administrativeBoundaryLayers';
import MapLegend from './MapLegend';

describe('MapLegend', () => {
  it('renders each shared category exactly once with its shared color', () => {
    const { container } = render(<MapLegend />);
    Object.entries(EVENT_TYPE_LABELS).forEach(([type, label]) => {
      expect(screen.getAllByText(label)).toHaveLength(1);
      const item = screen.getByText(label).closest('.map-legend__item');
      expect(item?.querySelector('.map-legend__marker')).toHaveStyle({
        backgroundColor: EVENT_TYPE_COLORS[type as keyof typeof EVENT_TYPE_COLORS],
      });
    });
    expect(container.querySelectorAll('.map-legend__categories .map-legend__item')).toHaveLength(4);
  });

  it('renders as controlled popover content without native open state', () => {
    render(<MapLegend />);
    expect(screen.getByRole('heading', { name: 'Chú giải bản đồ' })).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(document.querySelector('details')).toBeNull();
  });

  it('explains collection, atomic and cluster markers without color-only meaning', () => {
    render(<MapLegend />);
    expect(screen.getByRole('heading', { name: 'Màu sắc sự kiện' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ký hiệu trên bản đồ' })).toBeInTheDocument();
    expect(screen.getByText('Vòng tròn rỗng: Sự kiện có các sự kiện con')).toBeInTheDocument();
    expect(screen.getByText('Chấm tròn: Sự kiện cụ thể')).toBeInTheDocument();
    expect(screen.getByText(/Cụm có số: Nhiều sự kiện nằm gần nhau/)).toBeInTheDocument();
    expect(screen.getByText('Nhấn để xem gần hơn')).toBeInTheDocument();
    expect(screen.queryByText(/Marker|Badge/)).not.toBeInTheDocument();
  });

  it('offers the independent reference-layer selector and historical disclaimer', () => {
    const onBoundaryLayerChange = vi.fn();
    render(<MapLegend onBoundaryLayerChange={onBoundaryLayerChange} />);

    const selector = screen.getByRole('combobox', {
      name: 'Lớp ranh giới hành chính tham chiếu',
    });
    expect(screen.getByRole('option', { name: 'GADM — ranh giới tham chiếu hiện đại' }))
      .toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Việt Nam 2026 — 34 tỉnh/thành' }))
      .toBeInTheDocument();
    expect(screen.getByText(/không được hiểu là ranh giới hành chính lịch sử/)).toBeInTheDocument();
    expect(screen.getByText(/không phải phục dựng ranh giới lịch sử/)).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: VIETNAM_2026_34_LAYER_ID } });
    expect(onBoundaryLayerChange).toHaveBeenCalledWith(VIETNAM_2026_34_LAYER_ID);
  });
});
