import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useId } from 'react';
import {
  DIEN_BIEN_PHU_LEARNING_LOCATIONS,
  dienBienPhuLearningLocationForTarget,
  type DienBienPhuLearningLocation,
} from '../../data/dienBienPhuLearning';
import type { TerrainTarget } from '../../utils/terrainTargets';

export interface DienBienPhuLearningPanelProps {
  targets: readonly TerrainTarget[];
  selectedTargetId: string | null;
  onSelectTarget: (targetId: string) => void;
  onShowOverview: () => void;
  onExit: () => void;
}

const actionStyle = {
  border: '1px solid #d6d3d1',
  borderRadius: '10px',
  background: '#ffffff',
  color: '#292524',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

function targetLocationPairs(targets: readonly TerrainTarget[]) {
  return targets.flatMap((target) => {
    const location = dienBienPhuLearningLocationForTarget(target);
    return location ? [{ target, location }] : [];
  });
}

function LearningSources({ location }: { location: DienBienPhuLearningLocation }) {
  return (
    <details className="dbp-learning-sources">
      <summary>Nguồn tham khảo</summary>
      <div className="dbp-learning-sources__list">
        {location.sources.map((source) => (
          <article key={source.url} className="dbp-learning-source">
            <p>{source.organization}</p>
            <span>{source.title}</span>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Mở nguồn: ${source.title}`}
            >
              Mở nguồn <ExternalLink size={13} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
    </details>
  );
}

export default function DienBienPhuLearningPanel({
  targets,
  selectedTargetId,
  onSelectTarget,
  onShowOverview,
  onExit,
}: DienBienPhuLearningPanelProps) {
  const headingId = useId();
  const pairs = targetLocationPairs(targets);
  const selectedPair = pairs.find(({ target }) => target.id === selectedTargetId) ?? null;

  if (selectedPair) {
    const { location } = selectedPair;
    return (
      <section className="dbp-learning-panel" aria-labelledby={headingId}>
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          Đang xem địa điểm: {location.displayName}
        </span>
        <button
          type="button"
          onClick={onShowOverview}
          className="dbp-learning-back"
          aria-label="Quay lại các địa điểm và xem toàn bộ bốn vị trí"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Các địa điểm
        </button>

        <header className="dbp-learning-detail-header">
          <p>{location.phaseLabel}</p>
          <h3 id={headingId}>{location.displayName}</h3>
          {location.locationKind === 'representative_area' && <span>Khu vực</span>}
        </header>

        <div className="dbp-learning-sections">
          <section>
            <h4>Vai trò</h4>
            <p>{location.role}</p>
          </section>
          <section>
            <h4>Diễn biến</h4>
            <p>{location.development}</p>
          </section>
          <section>
            <h4>Mối liên hệ</h4>
            <p>{location.connection}</p>
          </section>
        </div>

        <LearningSources location={location} />

        <button
          type="button"
          onClick={onExit}
          className="terrain-action dbp-learning-action"
          style={{ ...actionStyle, color: '#8b1e1e' }}
        >
          Quay lại góc nhìn
        </button>
      </section>
    );
  }

  return (
    <section className="dbp-learning-panel" aria-labelledby={headingId}>
      <header className="dbp-learning-overview-header">
        <h3 id={headingId}>Chiến dịch Điện Biên Phủ</h3>
        <p>13/3/1954 – 7/5/1954</p>
        <span>
          Khám phá một số vị trí tiêu biểu và tìm hiểu mối liên hệ giữa chúng trong chiến dịch.
        </span>
      </header>

      <div className="dbp-learning-locations">
        <h3>Các địa điểm</h3>
        <div role="list" aria-label="Các địa điểm học tập tiêu biểu">
          {DIEN_BIEN_PHU_LEARNING_LOCATIONS.map((location) => {
            const pair = pairs.find((item) => item.location.key === location.key);
            if (!pair) return null;
            return (
              <div role="listitem" key={location.key}>
                <button
                  type="button"
                  onClick={() => onSelectTarget(pair.target.id)}
                  aria-pressed={false}
                  className="dbp-learning-location-row"
                >
                  <span>{location.displayName}</span>
                  <small>{location.phaseLabel}</small>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dbp-learning-actions">
        <button
          type="button"
          onClick={onShowOverview}
          aria-pressed="true"
          className="terrain-action dbp-learning-action"
          style={actionStyle}
        >
          Xem toàn bộ
        </button>
        <button
          type="button"
          onClick={onExit}
          className="terrain-action dbp-learning-action"
          style={{ ...actionStyle, color: '#8b1e1e' }}
        >
          Quay lại góc nhìn
        </button>
      </div>
    </section>
  );
}
