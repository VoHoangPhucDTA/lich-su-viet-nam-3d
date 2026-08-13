import { Link } from 'react-router-dom';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';

export function DashboardRecommendationCard({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const recommendation = vm.recommendations[0];
  if (!recommendation) return null;
  return (
    <section className="dashboard-recommendation" aria-labelledby="dashboard-recommendation-title">
      <div>
        <p className="dashboard-section-kicker">Gợi ý ôn tập hôm nay</p>
        <h2 id="dashboard-recommendation-title">{recommendation.title}</h2>
        {recommendation.evidence ? (
          <dl className="dashboard-evidence" aria-label="Bằng chứng cho gợi ý ôn tập">
            <div><dt>Độ chính xác</dt><dd>{recommendation.evidence.accuracy.toLocaleString('vi-VN')}%</dd></div>
            <div><dt>Kết quả</dt><dd>{recommendation.evidence.correctUnits}/{recommendation.evidence.totalUnits} ý đúng</dd></div>
            <div><dt>Số bài</dt><dd>{recommendation.evidence.attemptCount} bài</dd></div>
          </dl>
        ) : null}
      </div>
      <Link className="dashboard-primary-action" to={recommendation.actionRoute}>
        {recommendation.actionLabel}
      </Link>
    </section>
  );
}
