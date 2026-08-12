import { Link } from 'react-router-dom';
import { formatExamTitle } from '@/lib/exam/examDisplay';
import {
  formatDashboardDuration,
  formatDashboardScore,
} from '../dashboardFormatters';
import type { RecentAttemptItem } from '../dashboardTypes';

function detailStatusLabel(status: RecentAttemptItem['detailStatus']) {
  if (status === 'full') return 'Đủ dữ liệu chi tiết';
  if (status === 'summary-only') return 'Chỉ có dữ liệu tổng quan';
  return 'Không có dữ liệu chi tiết';
}

function DashboardRecentAttemptItem({ attempt }: { attempt: RecentAttemptItem }) {
  const displayTitle = formatExamTitle({ title: attempt.title });
  return (
    <li>
      <article className="dashboard-attempt-row">
        <strong className="dashboard-attempt-score">{formatDashboardScore(attempt.score)}<small>/10</small></strong>
        <div className="dashboard-attempt-copy">
          <h3>{displayTitle}</h3>
          <p>{attempt.modeLabel} · <time dateTime={attempt.submittedAt}>{attempt.submittedLabel}</time></p>
          <p>{formatDashboardDuration(attempt.durationSeconds)} · {attempt.totalQuestions} câu · {detailStatusLabel(attempt.detailStatus)}</p>
        </div>
        {attempt.resultRoute
          ? <Link className="dashboard-attempt-action" aria-label={`Xem lại bài làm: ${displayTitle}`} to={attempt.resultRoute}>Xem lại</Link>
          : <span className="dashboard-attempt-action dashboard-attempt-action-disabled" aria-label="Không có dữ liệu xem lại an toàn">Chỉ tổng quan</span>}
      </article>
    </li>
  );
}

export function DashboardRecentAttempts({ items }: { items: RecentAttemptItem[] }) {
  const shown = items.slice(0, 5);
  return (
    <section className="dashboard-card dashboard-history" aria-labelledby="dashboard-history-title">
      <div className="dashboard-section-heading">
        <div><p className="dashboard-section-kicker">{shown.length} bài gần nhất</p><h2 id="dashboard-history-title">Lịch sử gần đây</h2></div>
        <Link className="dashboard-text-link" to="/exams/lich-su">Xem toàn bộ lịch sử</Link>
      </div>
      {shown.length ? <ul>{shown.map((item) => <DashboardRecentAttemptItem key={item.attemptId} attempt={item} />)}</ul> : <p>Chưa có bài thi nào.</p>}
    </section>
  );
}
