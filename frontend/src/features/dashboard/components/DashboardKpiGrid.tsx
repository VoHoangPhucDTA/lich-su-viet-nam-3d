import { formatDashboardScore } from '../dashboardFormatters';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';

export function DashboardKpiGrid({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const items = [
    { label: 'Số bài đã làm', value: vm.summary.totalAttempts.toLocaleString('vi-VN'), suffix: 'bài' },
    { label: 'Điểm trung bình', value: formatDashboardScore(vm.summary.averageScore), suffix: '/10' },
    { label: 'Điểm cao nhất', value: formatDashboardScore(vm.summary.highestScore), suffix: '/10' },
    { label: 'Điểm gần nhất', value: formatDashboardScore(vm.summary.latestScore), suffix: '/10' },
  ];
  return (
    <section className="dashboard-card dashboard-kpi-surface" aria-labelledby="dashboard-kpi-title">
      <h2 id="dashboard-kpi-title" className="dashboard-visually-hidden">Chỉ số tổng hợp</h2>
      <div className="dashboard-kpi-grid">
        {items.map((item) => (
          <article className="dashboard-kpi-card" key={item.label} aria-label={`${item.label}: ${item.value} ${item.suffix}`}>
            <div className="dashboard-kpi-heading"><p>{item.label}</p></div>
            <div className="dashboard-kpi-value"><strong>{item.value}</strong><span>{item.suffix}</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}
