import { Check, Info, LoaderCircle, Mountain } from 'lucide-react';
import { terrainCtaLabel, type TerrainInsight } from '../../data/terrainInsights';
import type { TerrainViewModel } from '../../types/terrain';
import TerrainInsightCard from './TerrainInsightCard';
import TerrainTargetList from './TerrainTargetList';

interface TerrainControlsProps {
  terrain: TerrainViewModel;
  insight: TerrainInsight | null;
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

export default function TerrainControls({
  terrain,
  insight,
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
        className="terrain-action flex items-center justify-center gap-2"
        style={{ ...buttonStyle, borderColor: '#8b1e1e', color: '#8b1e1e' }}
      >
        <Mountain size={16} aria-hidden="true" />
        {terrainCtaLabel(insight)}
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
      <div
        role="status"
        aria-atomic="true"
        className="flex items-center gap-2"
        style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}
      >
        <Check size={16} aria-hidden="true" />
        <span>
          Đang xem địa hình{selected ? `: ${selected.label}` : ''}
        </span>
      </div>

      {insight ? (
        <TerrainInsightCard insight={insight} />
      ) : null}

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
        <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>Địa hình đang được phóng đại theo chiều đứng 2× để dễ quan sát; số đo vẫn dùng cao độ terrain được lấy mẫu.</span>
          <span>Mô hình địa hình tham chiếu thời hiện đại. Sông, bờ biển và cảnh quan có thể khác so với thời điểm lịch sử.</span>
        </span>
      </p>
    </div>
  );
}
