import { render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerrainExplorationToolbar from './TerrainExplorationToolbar';
import type { TerrainExplorationInspectorState } from './TerrainExplorationToolbar';
import type { TerrainDistanceMeasurementState } from '../../utils/terrainMeasurement';

const emptyState: TerrainExplorationInspectorState = {
  result: null,
  loading: false,
  error: null,
};

const waitingForStart: TerrainDistanceMeasurementState = {
  phase: 'waiting-for-start',
  sessionId: 1,
  start: null,
  end: null,
  distanceMeters: null,
  error: null,
};

describe('TerrainExplorationToolbar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      <TerrainExplorationToolbar
        isVisible={false}
        explorationMode="none"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('map-exploration-toolbar')).not.toBeInTheDocument();
  });

  it('shows the three primary buttons when visible', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="none"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Thu nhỏ bản đồ 3D' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Phóng to bản đồ 3D' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' })
    ).toBeInTheDocument();
  });

  it('exposes an aria-pressed and dispatches the right mode when toggling inspect', () => {
    const onToggleInspect = vi.fn();
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="none"
        onToggleMode={onToggleInspect}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    // Open the tools panel
    fireEvent.click(
      screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' })
    );

    const toggle = screen.getByRole('button', {
      name: 'Bật chọn vị trí trên bản đồ',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(onToggleInspect).toHaveBeenCalledWith('inspect-location');
  });

  it('updates aria-pressed to true when inspect-mode is active', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="inspect-location"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' })
    );
    const toggle = screen.getByRole('button', {
      name: 'Đang chờ bạn chọn vị trí…',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders help rows and an inspect button inside the tools panel', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="none"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' })
    );

    expect(screen.getByRole('dialog', { name: 'Công cụ khám phá' })).toBeInTheDocument();
    // Help rows include the documented Cesium 1.139 default mapping labels.
    expect(screen.getByText('Kéo chuột trái')).toBeInTheDocument();
    expect(
      screen.getByText('Cuộn chuột hoặc kéo chuột phải')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Kéo chuột giữa hoặc Ctrl + chuột trái')
    ).toBeInTheDocument();
    expect(screen.getByText('Chạm và kéo một ngón')).toBeInTheDocument();
    expect(
      screen.getByText('Chụm hoặc kéo hai ngón')
    ).toBeInTheDocument();
  });

  it('closes the tools panel on Escape and restores focus to trigger', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="none"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(trigger).toHaveAttribute('aria-controls', dialog.id);
    expect(
      screen.getByRole('button', { name: 'Đóng bảng công cụ khám phá' })
    ).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(
      screen.queryByRole('button', { name: 'Đóng bảng công cụ khám phá' })
    ).not.toBeInTheDocument();
    // Trigger is now labelled "Mở ..." again
    expect(
      screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' })
    ).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders formatted lat/lng/height when a result is provided', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="inspect-location"
        onToggleMode={() => {}}
        inspectionState={{
          result: {
            latitude: 15.2251,
            longitude: 108.6552,
            heightMeters: 42,
            heightStatus: 'available',
          },
          loading: false,
          error: null,
        }}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' })
    );

    expect(
      screen.getByText('15.2251° N')
    ).toBeInTheDocument();
    expect(
      screen.getByText('108.6552° E')
    ).toBeInTheDocument();
    expect(screen.getByText(/42\.0 m/)).toBeInTheDocument();

    expect(
      screen.getByText(/Đã có dữ liệu độ cao từ địa hình 3D/)
    ).toBeInTheDocument();
  });

  it('disables zoom and inspect when host signals disabled state', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="none"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomDisabled
        explorationDisabled
      />
    );

    expect(
      screen.getByRole('button', { name: 'Thu nhỏ bản đồ 3D' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Phóng to bản đồ 3D' })
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' })
    );
    expect(
      screen.getByRole('button', {
        name: 'Bật chọn vị trí trên bản đồ',
      })
    ).toBeDisabled();
  });

  it('shows modern-reference data information and the three learning prompts', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        terrainDataSourceStatus="world-terrain"
        explorationMode="none"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' }));

    expect(screen.getByText('Thông tin dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Cesium World Terrain')).toBeInTheDocument();
    expect(screen.getByText('Địa hình tham chiếu thời hiện đại.')).toBeInTheDocument();
    expect(screen.getByText('Gợi ý khám phá')).toBeInTheDocument();
    expect(screen.getByText(/Khu vực hiện nay thuộc miền núi/)).toBeInTheDocument();
    expect(screen.getByText(/Các địa điểm liên quan phân bố/)).toBeInTheDocument();
    expect(screen.getByText(/Yếu tố địa lý nào có thể/)).toBeInTheDocument();
    expect(screen.getByText('Phạm vi sử dụng')).toBeInTheDocument();
    expect(screen.getByText(/không dùng để khẳng định đường đi/i)).toBeInTheDocument();
    expect(screen.queryByText(/phục dựng địa hình lịch sử/i)).not.toBeInTheDocument();
  });

  it('does not present ellipsoid fallback height as a terrain measurement', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        terrainDataSourceStatus="ellipsoid-fallback"
        explorationMode="inspect-location"
        onToggleMode={() => {}}
        inspectionState={{
          result: {
            latitude: 15.2251,
            longitude: 108.6552,
            heightMeters: 0,
            heightStatus: 'ellipsoid_only',
          },
          loading: false,
          error: null,
        }}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' }));

    expect(screen.getByText('Bề mặt tham chiếu dự phòng')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0.0 m')).not.toBeInTheDocument();
    expect(screen.getByText(/Không có dữ liệu độ cao địa hình chi tiết; vị trí hiển thị theo bề mặt tham chiếu/)).toBeInTheDocument();
    expect(screen.queryByText(/ellipsoid/i)).not.toBeInTheDocument();
  });

  it('offers an exclusive distance mode with aria-pressed state', () => {
    const onToggleMode = vi.fn();
    const { rerender } = render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="none"
        onToggleMode={onToggleMode}
        inspectionState={emptyState}
        measurementState={waitingForStart}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' }));
    const measureButton = screen.getByRole('button', { name: 'So sánh khoảng cách' });
    expect(measureButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(measureButton);
    expect(onToggleMode).toHaveBeenCalledWith('measure-distance');

    rerender(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="measure-distance"
        onToggleMode={onToggleMode}
        inspectionState={emptyState}
        measurementState={waitingForStart}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'So sánh khoảng cách' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('switches directly between inspect and measure without dual activation', () => {
    const onToggleMode = vi.fn();
    const { rerender } = render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="inspect-location"
        onToggleMode={onToggleMode}
        inspectionState={emptyState}
        measurementState={waitingForStart}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' }));
    fireEvent.click(screen.getByRole('button', { name: 'So sánh khoảng cách' }));
    expect(onToggleMode).toHaveBeenLastCalledWith('measure-distance');

    rerender(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="measure-distance"
        onToggleMode={onToggleMode}
        inspectionState={emptyState}
        measurementState={waitingForStart}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bật chọn vị trí trên bản đồ' }));
    expect(onToggleMode).toHaveBeenLastCalledWith('inspect-location');
  });

  it('shows start and end guidance for the measurement phases', () => {
    const { rerender } = render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="measure-distance"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        measurementState={waitingForStart}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' }));
    expect(screen.getByText('Chọn hai vị trí để ước lượng chúng cách nhau bao xa trên bản đồ.')).toBeInTheDocument();
    expect(screen.getByText('Công cụ tùy chọn để so sánh khoảng cách giữa các vị trí.')).toBeInTheDocument();

    rerender(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="measure-distance"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        measurementState={{
          ...waitingForStart,
          phase: 'waiting-for-end',
          start: { latitude: 10, longitude: 106, terrainHeightMeters: null },
        }}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    expect(screen.getByText('Đã chọn điểm A. Chọn vị trí thứ hai để so sánh.')).toBeInTheDocument();
  });

  it('shows a reference result, reset and clear actions with academic wording', () => {
    const onResetMeasurement = vi.fn();
    const onClearMeasurement = vi.fn();
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="measure-distance"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        measurementState={{
          phase: 'complete',
          sessionId: 2,
          start: { latitude: 10, longitude: 106, terrainHeightMeters: 20 },
          end: { latitude: 10.01, longitude: 106.02, terrainHeightMeters: null },
          distanceMeters: 2450,
          error: null,
        }}
        onResetMeasurement={onResetMeasurement}
        onClearMeasurement={onClearMeasurement}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' }));

    expect(screen.getByText(/Khoảng cách gần đúng:/)).toHaveTextContent('2,45 km');
    expect(screen.getByText('Khoảng cách gần đúng giữa hai vị trí trên bản đồ.'))
      .toBeInTheDocument();
    expect(screen.getByText('Kết quả không phải quãng đường di chuyển thực tế trong lịch sử.'))
      .toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/ellipsoid|WGS84|geodesic surface distance|TerrainProvider|sampling/i);

    fireEvent.click(screen.getByRole('button', { name: 'Đo lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa phép đo' }));
    expect(onResetMeasurement).toHaveBeenCalledTimes(1);
    expect(onClearMeasurement).toHaveBeenCalledTimes(1);
  });

  it('keeps an active measurement when the tools panel is closed and reopened', () => {
    render(
      <TerrainExplorationToolbar
        isVisible
        explorationMode="measure-distance"
        onToggleMode={() => {}}
        inspectionState={emptyState}
        measurementState={waitingForStart}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
      />
    );
    const trigger = screen.getByRole('button', { name: 'Mở bảng công cụ khám phá' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng bảng công cụ khám phá' }));
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'So sánh khoảng cách' }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});
