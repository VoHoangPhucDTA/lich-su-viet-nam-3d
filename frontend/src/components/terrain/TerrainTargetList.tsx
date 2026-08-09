import { Check, Map, MapPin } from 'lucide-react';
import { useId } from 'react';
import type { TerrainTarget } from '../../utils/terrainTargets';

interface TerrainTargetListProps {
  targets: TerrainTarget[];
  selectedTargetId: string | null;
  onSelectTarget: (targetId: string) => void;
}

const targetButtonStyle = {
  border: '1px solid #d6d3d1',
  borderRadius: '10px',
  background: '#ffffff',
  color: '#292524',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

export default function TerrainTargetList({
  targets,
  selectedTargetId,
  onSelectTarget,
}: TerrainTargetListProps) {
  const listLabelId = useId();
  return (
    <div>
      <div
        id={listLabelId}
        style={{
          fontSize: '11px',
          fontWeight: 800,
          color: '#78716c',
          marginBottom: '7px',
          textTransform: 'uppercase',
        }}
      >
        Các địa điểm
      </div>
      <p className="terrain-target-list-source">
        Theo dữ liệu bản đồ của đề tài; danh sách không mặc định biểu diễn trình tự lịch sử.
      </p>
      <div
        role="list"
        aria-labelledby={listLabelId}
        style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}
      >
        {targets.map((target) => {
          const isSelected = selectedTargetId === target.id;
          return (
            <div role="listitem" key={target.id}>
              <button
                type="button"
                onClick={() => onSelectTarget(target.id)}
                aria-pressed={isSelected}
                className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  ...targetButtonStyle,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'left',
                  borderWidth: isSelected ? '2px' : '1px',
                  borderColor: isSelected ? '#8b1e1e' : '#d6d3d1',
                  background: isSelected ? '#fef2f2' : '#ffffff',
                }}
              >
                {target.kind === 'point'
                  ? <MapPin size={15} aria-hidden="true" />
                  : <Map size={15} aria-hidden="true" />}
                <span style={{ flex: 1 }}>{target.label}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#78716c' }}>
                  {target.kind === 'point' ? 'Địa điểm' : 'Khu vực'}
                </span>
                {isSelected && <Check size={14} aria-label="Đang chọn" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
