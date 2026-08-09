import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from '../../types/event';
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
    expect(screen.getByText('Marker vòng: nhóm sự kiện')).toBeInTheDocument();
    expect(screen.getByText('Marker đặc: sự kiện cụ thể')).toBeInTheDocument();
    expect(screen.getByText('Badge có số: cụm điểm trên bản đồ')).toBeInTheDocument();
  });
});
