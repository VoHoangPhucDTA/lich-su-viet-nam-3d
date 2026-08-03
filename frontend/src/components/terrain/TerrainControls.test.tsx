import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

    expect(
      screen.getByRole('button', { name: 'Khám phá địa hình khu vực' })
    ).toBeInTheDocument();
  });
});
