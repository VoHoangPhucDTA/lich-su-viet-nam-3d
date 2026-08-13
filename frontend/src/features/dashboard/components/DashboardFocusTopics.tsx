import { Link } from 'react-router-dom';
import type {
  LearningInsight,
  PersonalLearningDashboardViewModel,
} from '../dashboardTypes';
import { statusLabels } from './dashboardDisplayLabels';

const MAX_ACTIONABLE_TOPICS = 3;

function pickActionable(vm: PersonalLearningDashboardViewModel): LearningInsight[] {
  const recommendationKey = vm.recommendations[0]?.topicKey ?? null;
  const filtered = vm.weaknesses.filter(
    (item) => !(recommendationKey !== null && item.key === recommendationKey),
  );
  const actionable = filtered.filter((item) => item.practiceRoute).slice(0, MAX_ACTIONABLE_TOPICS);
  if (actionable.length > 0) return actionable;
  return filtered.slice(0, MAX_ACTIONABLE_TOPICS);
}

export function DashboardFocusTopics({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const topics = pickActionable(vm);
  if (topics.length === 0) return null;
  return (
    <section
      className="dashboard-card dashboard-focus-topics"
      aria-labelledby="dashboard-focus-topics-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-section-kicker">Phân tích chủ đề</p>
          <h2 id="dashboard-focus-topics-title">Các chủ đề khác cần chú ý</h2>
        </div>
      </div>
      <ul className="dashboard-focus-topics-list">
        {topics.map((item) => (
          <li
            key={item.key}
            className={`dashboard-focus-topic-item dashboard-focus-topic-${item.status}`}
          >
            <div className="dashboard-focus-topic-body">
              <h3>
                {item.practiceRoute
                  ? <Link className="dashboard-topic-link" to={item.practiceRoute}>{item.label}</Link>
                  : item.label}
              </h3>
              <p className="dashboard-focus-topic-meta">
                <span className={`dashboard-status dashboard-status-${item.status}`}>
                  {statusLabels[item.status]}
                </span>
                <span aria-hidden="true">·</span>
                <span>{item.correctUnits}/{item.totalUnits} ý</span>
                <span aria-hidden="true">·</span>
                <span>{item.attemptCount} bài</span>
              </p>
            </div>
            <div className="dashboard-focus-topic-result">
              <strong className={`dashboard-accuracy dashboard-accuracy-${item.status}`}>
                {item.accuracy.toLocaleString('vi-VN')}%
              </strong>
              {item.practiceRoute && (
                <Link
                  className="dashboard-topic-cta"
                  to={item.practiceRoute}
                  aria-label={`Ôn chủ đề ${item.label}`}
                >
                  Ôn
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
