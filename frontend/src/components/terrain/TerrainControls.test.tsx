import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getTerrainInsightBySlug } from '../../data/terrainInsights';
import type { TerrainViewModel } from '../../types/terrain';
import TerrainControls from './TerrainControls';

const activeTerrain: TerrainViewModel = {
  mode: 'active',
  providerStatus: 'ready',
  geometryStatus: 'ready',
  targets: [],
  selectedTargetId: null,
  eligible: true,
  ineligibleReason: 'missing_map_data',
  error: null,
};

const callbacks = {
  insight: null,
  onOpen: () => {},
  onRetry: () => {},
  onSelectTarget: () => {},
  onShowOverview: () => {},
  onExit: () => {},
};

describe('TerrainControls academic alignment', () => {
  it('shows the modern-reference disclaimer only while terrain is active', () => {
    const { rerender } = render(<TerrainControls terrain={activeTerrain} {...callbacks} />);
    const exaggerationText = screen.getByText(/phóng đại theo chiều đứng 2×/);
    const modernReferenceText = screen.getByText(/Mô hình địa hình tham chiếu thời hiện đại/);
    expect(exaggerationText).toBeInTheDocument();
    expect(exaggerationText.parentElement).toBe(modernReferenceText.parentElement);

    expect(screen.getByText(/Mô hình địa hình tham chiếu thời hiện đại/)).toBeInTheDocument();
    expect(screen.queryByText(/phục dựng địa hình lịch sử/i)).not.toBeInTheDocument();

    rerender(<TerrainControls terrain={{ ...activeTerrain, mode: 'idle' }} {...callbacks} />);
    expect(screen.queryByText(/Mô hình địa hình tham chiếu thời hiện đại/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Địa hình đang được phóng đại theo chiều đứng 2×/)).not.toBeInTheDocument();
  });

  it('uses the academic-alignment CTA before a terrain session begins', () => {
    render(<TerrainControls terrain={{ ...activeTerrain, mode: 'idle' }} {...callbacks} />);

    const button = screen.getByRole('button', { name: 'Khám phá địa hình khu vực' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('map-popup-terrain-action');
    expect(button.querySelector('svg')).toBeNull();
  });

  it('announces only the short active status when the selected target changes', () => {
    const insight = getTerrainInsightBySlug('khang-chien-chong-quan-nguyen-1287-1288');
    const terrain: TerrainViewModel = {
      ...activeTerrain,
      targets: [
        { id: 'point-1', kind: 'point', label: 'Him Lam', position: { lat: 21.405, lng: 103.023 }, sourceIndex: 0 },
        { id: 'point-2', kind: 'point', label: 'Mường Thanh', position: { lat: 21.385, lng: 103.006 }, sourceIndex: 1 },
      ],
    };
    const { rerender } = render(
      <TerrainControls terrain={terrain} {...callbacks} insight={insight} />,
    );

    expect(screen.getAllByRole('status')).toHaveLength(1);
    const initialStatus = screen.getByRole('status');
    expect(initialStatus).toHaveTextContent('Đang xem địa hình');
    expect(within(initialStatus).queryByText('Theo SGK')).not.toBeInTheDocument();
    const card = screen.getByRole('region', { name: insight?.headline });
    expect(card).not.toHaveAttribute('aria-live');

    rerender(
      <TerrainControls
        terrain={{ ...terrain, selectedTargetId: 'point-1' }}
        {...callbacks}
        insight={insight}
      />,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Đang xem địa hình: Him Lam');
    expect(within(screen.getByRole('status')).queryByText('Theo SGK')).not.toBeInTheDocument();
  });

  it('uses the selected event insight CTA without creating a second terrain button', () => {
    const insight = getTerrainInsightBySlug('chien-dich-dien-bien-phu-1954');
    render(
      <TerrainControls
        terrain={{ ...activeTerrain, mode: 'idle' }}
        {...callbacks}
        insight={insight}
      />,
    );

    const button = screen.getByRole('button', { name: 'Xem không gian diễn biến chiến dịch' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('map-popup-terrain-action');
    expect(button.querySelector('svg')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('renders no insight card or empty container for an active no-insight event', () => {
    const terrain: TerrainViewModel = {
      ...activeTerrain,
      targets: [
        { id: 'point-1', kind: 'point', label: 'Điểm một', position: { lat: 21, lng: 103 }, sourceIndex: 0 },
        { id: 'point-2', kind: 'point', label: 'Điểm hai', position: { lat: 21.1, lng: 103.1 }, sourceIndex: 1 },
      ],
    };
    render(<TerrainControls terrain={terrain} {...callbacks} />);

    expect(screen.queryByRole('region', { name: /Quan sát không gian/i })).not.toBeInTheDocument();
    expect(screen.getByRole('list', {
      name: /các địa điểm/i,
    })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders the insight card immediately above the production target list', () => {
    const insight = getTerrainInsightBySlug('khang-chien-chong-quan-nguyen-1287-1288');
    const terrain: TerrainViewModel = {
      ...activeTerrain,
      targets: [
        { id: 'point-1', kind: 'point', label: 'Him Lam', position: { lat: 21.405, lng: 103.023 }, sourceIndex: 0 },
        { id: 'point-2', kind: 'point', label: 'Mường Thanh', position: { lat: 21.385, lng: 103.006 }, sourceIndex: 1 },
      ],
    };
    render(<TerrainControls terrain={terrain} {...callbacks} insight={insight} />);

    const card = screen.getByRole('region', { name: insight?.headline });
    const targetList = screen.getByRole('list', {
      name: /các địa điểm/i,
    });
    expect(card.compareDocumentPosition(targetList) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('renders the controlled target-list source label once', () => {
    const terrain: TerrainViewModel = {
      ...activeTerrain,
      targets: [
        { id: 'point-1', kind: 'point', label: 'Điểm một', position: { lat: 21, lng: 103 }, sourceIndex: 0 },
        { id: 'point-2', kind: 'point', label: 'Điểm hai', position: { lat: 21.1, lng: 103.1 }, sourceIndex: 1 },
      ],
    };
    render(<TerrainControls terrain={terrain} {...callbacks} />);

    expect(screen.getAllByText('Các địa điểm')).toHaveLength(1);
    expect(screen.getByText(/danh sách không mặc định biểu diễn trình tự lịch sử/i)).toBeInTheDocument();
    const list = screen.getByRole('list', {
      name: /các địa điểm/i,
    });
    expect(list.parentElement).not.toHaveAttribute('aria-label');
  });

  it('preserves target selection behavior with the visible accessible label', () => {
    const onSelectTarget = vi.fn();
    const terrain: TerrainViewModel = {
      ...activeTerrain,
      targets: [
        { id: 'point-1', kind: 'point', label: 'Him Lam', position: { lat: 21.405, lng: 103.023 }, sourceIndex: 0 },
        { id: 'point-2', kind: 'point', label: 'Mường Thanh', position: { lat: 21.385, lng: 103.006 }, sourceIndex: 1 },
      ],
    };
    render(<TerrainControls terrain={terrain} {...callbacks} onSelectTarget={onSelectTarget} />);

    const list = screen.getByRole('list', {
      name: /các địa điểm/i,
    });
    fireEvent.click(within(list).getByRole('button', { name: /Mường Thanh/ }));
    expect(onSelectTarget).toHaveBeenCalledWith('point-2');
  });

  it('shows sourced event context and only location identity for a target without description data', () => {
    const insight = getTerrainInsightBySlug('khang-chien-chong-quan-nguyen-1287-1288');
    const terrain: TerrainViewModel = {
      ...activeTerrain,
      selectedTargetId: 'point-1',
      targets: [
        { id: 'point-1', kind: 'point', label: 'Vân Đồn', position: { lat: 21.405, lng: 103.023 }, sourceIndex: 0 },
        { id: 'point-2', kind: 'point', label: 'Bạch Đằng', position: { lat: 21.385, lng: 103.006 }, sourceIndex: 1 },
      ],
    };
    render(
      <TerrainControls
        terrain={terrain}
        {...callbacks}
        eventName="Kháng chiến chống quân Nguyên 1287–1288"
        insight={insight}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Đang xem địa hình: Kháng chiến chống quân Nguyên 1287–1288');
    expect(screen.getByRole('heading', { name: 'Diễn biến / Theo SGK' })).toBeInTheDocument();
    const selectedHeading = screen.getByRole('heading', { name: 'Vân Đồn' });
    const selectedSection = selectedHeading.closest('section');
    expect(selectedSection).not.toBeNull();
    expect(within(selectedSection!).getByText('Địa điểm trên bản đồ sự kiện')).toBeInTheDocument();
    expect(within(selectedSection!).queryByText(/cứ điểm|đợt tiến công|chiến thắng/i)).not.toBeInTheDocument();
  });

  it('reuses the overview callback for the fit-all action', () => {
    const onShowOverview = vi.fn();
    render(<TerrainControls terrain={activeTerrain} {...callbacks} onShowOverview={onShowOverview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem toàn bộ' }));
    expect(onShowOverview).toHaveBeenCalledOnce();
  });
});
