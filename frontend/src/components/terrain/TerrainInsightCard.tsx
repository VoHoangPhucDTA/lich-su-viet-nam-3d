import { BookOpen, Eye } from 'lucide-react';
import type { TerrainInsight } from '../../data/terrainInsights';

interface TerrainInsightCardProps {
  insight: TerrainInsight;
}

export default function TerrainInsightCard({ insight }: TerrainInsightCardProps) {
  return (
    <section
      aria-labelledby="terrain-insight-heading"
      style={{
        border: '1px solid #e7e5e4',
        borderRadius: '12px',
        background: '#fffbeb',
        padding: '12px',
        color: '#292524',
      }}
    >
      <div data-testid="terrain-insight-sourced-content">
        <div className="flex items-center gap-1.5" style={{ color: '#8b1e1e', fontSize: '11px', fontWeight: 800 }}>
          <BookOpen size={14} aria-hidden="true" />
          <span>Theo SGK</span>
        </div>
        <h3 id="terrain-insight-heading" style={{ margin: '6px 0', fontSize: '14px', lineHeight: 1.4 }}>
          {insight.headline}
        </h3>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55 }}>
          {insight.explanation}
        </p>
        <p style={{ margin: '7px 0 0', color: '#57534e', fontSize: '11.5px', lineHeight: 1.45 }}>
          <strong>Nguồn:</strong> {insight.sourceRef}
        </p>
      </div>

      <div data-testid="terrain-insight-observation-content">
        <div className="flex items-center gap-1.5" style={{ marginTop: '11px', color: '#166534', fontSize: '11px', fontWeight: 800 }}>
          <Eye size={14} aria-hidden="true" />
          <span>Quan sát trên mô hình 3D — địa hình hiện nay</span>
        </div>
        <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', lineHeight: 1.5 }}>
          {insight.observePoints.map((point) => <li key={point}>{point}</li>)}
        </ul>
      </div>

      {insight.scopeNote ? (
        <aside
          data-testid="terrain-insight-scope-note"
          style={{ marginTop: '9px', color: '#57534e', fontSize: '11.5px', lineHeight: 1.45 }}
        >
          {insight.scopeNote}
        </aside>
      ) : null}
    </section>
  );
}
