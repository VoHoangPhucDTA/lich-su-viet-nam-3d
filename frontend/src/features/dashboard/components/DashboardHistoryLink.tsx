import { Link } from 'react-router-dom';
import { formatDashboardScore } from '../dashboardFormatters';
import { formatExamTitle } from '@/lib/exam/examDisplay';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';

export function DashboardHistoryLink({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const latestPoint = vm.scoreTrend.points.at(-1) ?? null;
  const latestTitle = latestPoint ? formatExamTitle({ title: latestPoint.title }) : null;
  if (!latestPoint) {
    return (
      <section className="dashboard-card dashboard-history-link" aria-labelledby="dashboard-history-link-title">
        <div>
          <h3 id="dashboard-history-link-title">Lịch sử luyện thi</h3>
          <p>Xem lại toàn bộ bài thi và đề đã làm ở trang lịch sử.</p>
        </div>
        <Link className="dashboard-text-link" to="/exams/lich-su">
          Mở lịch sử luyện thi
        </Link>
      </section>
    );
  }
  return (
    <section className="dashboard-card dashboard-history-link" aria-labelledby="dashboard-history-link-title">
      <div>
        <h3 id="dashboard-history-link-title">Lịch sử luyện thi</h3>
        <p>
          Bài gần nhất: <strong>{formatDashboardScore(latestPoint.score)}/10</strong> · {latestTitle ?? latestPoint.title}
        </p>
      </div>
      <Link className="dashboard-text-link" to="/exams/lich-su">
        Mở lịch sử luyện thi
      </Link>
    </section>
  );
}
