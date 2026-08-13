import type { CognitivePerformance } from '../dashboardTypes';
import { statusLabels } from './dashboardDisplayLabels';
import { DashboardMeter } from './DashboardMeter';

function CognitiveItem({ item }: { item: CognitivePerformance }) {
  const hasSmallSample = item.confidence === 'low' || item.status === 'insufficient-data';
  return (
    <li className={`dashboard-performance-item dashboard-performance-${item.status}`}>
      <div className="dashboard-performance-title">
        <h3>{item.label}</h3>
        <span className={`dashboard-status dashboard-status-${item.status}`}>
          {statusLabels[item.status]}
        </span>
      </div>
      <DashboardMeter label={item.label} accuracy={item.accuracy} status={item.status} />
      <p><strong className={`dashboard-accuracy dashboard-accuracy-${item.status}`}>{item.accuracy === null ? '—' : `${item.accuracy.toLocaleString('vi-VN')}%`}</strong> · {item.correctUnits}/{item.totalUnits} ý</p>
      <p>{item.attemptCount} bài</p>
      {hasSmallSample && <p className="dashboard-caution">Mẫu dữ liệu còn ít.</p>}
    </li>
  );
}

export function DashboardCognitivePerformance({ items }: { items: CognitivePerformance[] }) {
  return (
    <section className="dashboard-card dashboard-performance-card dashboard-cognitive-card" aria-labelledby="dashboard-cognitive-title">
      <div className="dashboard-rail-heading">
        <div><p className="dashboard-section-kicker">Năng lực tư duy</p><h2 id="dashboard-cognitive-title">Mức nhận thức</h2></div>
      </div>
      {items.length ? <ul>{items.map((item) => <CognitiveItem key={item.level} item={item} />)}</ul> : <p>Chưa có dữ liệu chi tiết theo mức nhận thức.</p>}
    </section>
  );
}
