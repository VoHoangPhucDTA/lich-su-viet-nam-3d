import { Check, Info, LoaderCircle } from 'lucide-react';
import type { TerrainViewModel } from '../../types/terrain';
import TerrainTargetList from './TerrainTargetList';

interface TerrainControlsProps {
  terrain: TerrainViewModel;
  onOpen: () => void;
  onRetry: () => void;
  onSelectTarget: (targetId: string) => void;
  onShowOverview: () => void;
  onExit: () => void;
}

const buttonStyle = {
  border: '1px solid #d6d3d1',
  borderRadius: '10px',
  background: '#ffffff',
  color: '#292524',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

/**
 * Renders terrain-view controls and status messages based on the current terrain state.
 *
 * @param terrain - The terrain view state, targets, eligibility, and selected target.
 * @param onOpen - Called when terrain viewing is opened.
 * @param onRetry - Called to retry a failed terrain or geometry load.
 * @param onSelectTarget - Called when a terrain target is selected.
 * @param onShowOverview - Called to show the overview of all terrain targets.
 * @param onExit - Called to return to the previous map view.
 * @returns The terrain controls for the current state, or `null` when no controls are applicable.
 */
export default function TerrainControls({
  terrain,
  onOpen,
  onRetry,
  onSelectTarget,
  onShowOverview,
  onExit,
}: TerrainControlsProps) {
  if (terrain.mode === 'idle') {
    if (!terrain.eligible) {
      const hasRegionTarget = terrain.targets.some((target) => target.kind === 'region');
      if (hasRegionTarget && terrain.geometryStatus === 'loading') {
        return <div aria-live="polite" style={{ fontSize: '12px', color: '#57534e' }}>Đang chuẩn bị dữ liệu khu vực…</div>;
      }
      if (hasRegionTarget && terrain.geometryStatus === 'error') {
        return (
          <div style={{ width: '100%' }}>
            <div role="alert" style={{ fontSize: '12px', color: '#991b1b', marginBottom: '8px' }}>
              Chưa tải được dữ liệu khu vực trên bản đồ.
            </div>
            <button type="button" onClick={onRetry} className="terrain-action" style={buttonStyle}>Thử lại</button>
          </div>
        );
      }
      if (terrain.ineligibleReason === 'no_valid_targets' || terrain.ineligibleReason === 'invalid_geo_type') {
        return <div style={{ fontSize: '12px', color: '#78716c' }}>Sự kiện này chưa có vị trí đủ tin cậy để xem địa hình.</div>;
      }
      return null;
    }
    return (
      <button
        type="button"
        onClick={onOpen}
        className="terrain-action flex items-center justify-center"
        style={{ ...buttonStyle, borderColor: '#8b1e1e', color: '#8b1e1e' }}
      >
        Xem địa hình
      </button>
    );
  }

  if (terrain.mode === 'entering') {
    return (
      <div aria-live="polite" className="flex items-center gap-2" style={{ color: '#57534e', fontSize: '13px' }}>
        <LoaderCircle size={16} aria-hidden="true" />
        <span>Đang tải địa hình…</span>
      </div>
    );
  }

  if (terrain.mode === 'error') {
    return (
      <div style={{ width: '100%' }}>
        <div role="alert" style={{ fontSize: '12px', lineHeight: 1.5, color: '#991b1b', marginBottom: '10px' }}>
          {terrain.error?.message || 'Không thể tải dữ liệu địa hình. Vui lòng thử lại.'}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={onRetry} className="terrain-action" style={{ ...buttonStyle, color: '#8b1e1e' }}>
            Thử lại
          </button>
          <button type="button" onClick={onExit} className="terrain-action" style={buttonStyle}>
            Quay lại góc nhìn
          </button>
        </div>
      </div>
    );
  }

  if (terrain.mode === 'exiting') {
    return <div aria-live="polite" style={{ fontSize: '13px', color: '#57534e' }}>Đang khôi phục góc nhìn…</div>;
  }

  const selected = terrain.targets.find((target) => target.id === terrain.selectedTargetId);
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="flex items-center gap-2" style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
        <Check size={16} aria-hidden="true" />
        Đang xem địa hình{selected ? `: ${selected.label}` : ''}
      </div>

      {terrain.targets.length > 1 && (
        <TerrainTargetList
          targets={terrain.targets}
          selectedTargetId={terrain.selectedTargetId}
          onSelectTarget={onSelectTarget}
        />
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={onShowOverview}
          aria-pressed={terrain.selectedTargetId === null}
          className="terrain-action"
          style={buttonStyle}
        >
          Xem toàn bộ
        </button>
        <button type="button" onClick={onExit} className="terrain-action" style={{ ...buttonStyle, color: '#8b1e1e' }}>
          Quay lại góc nhìn
        </button>
      </div>
      <p className="flex gap-1.5" style={{ margin: 0, color: '#78716c', fontSize: '11px', lineHeight: 1.45 }}>
        <Info size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>Địa hình và ranh giới hiển thị theo dữ liệu hiện đại, dùng để tham khảo khu vực liên quan đến sự kiện.</span>
      </p>
    </div>
  );
}
