import { Link } from 'react-router-dom';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '../../features/dashboard/dashboardRoute';

export default function LearningAnalyticsEntryCard() {
  return (
    <Link
      aria-label="Xem phân tích luyện thi"
      className="group flex min-h-11 min-w-0 flex-col items-start gap-4 rounded-[var(--card-radius)] border border-red-200/70 bg-gradient-to-br from-red-50 to-amber-50/70 p-5 text-inherit no-underline shadow-[var(--admin-shadow)] transition hover:border-red-300 hover:shadow-md sm:flex-row sm:items-center sm:p-6"
      to={PERSONAL_LEARNING_DASHBOARD_ROUTE}
    >
      <span className="min-w-0 flex-1">
        <span className="ui-label block text-[0.8125rem] font-semibold uppercase leading-5 text-red-900">
          Luyện thi THPT
        </span>
        <span className="app-heading mt-1 block text-xl font-bold text-stone-900">
          Phân tích luyện thi
        </span>
        <span className="mt-2 block text-sm leading-6 text-stone-600">
          Theo dõi xu hướng điểm, chủ đề mạnh yếu và kết quả các bài thi thử.
        </span>
        <span className="mt-4 inline-block text-sm font-bold text-red-900">
          Xem phân tích luyện thi
        </span>
      </span>
    </Link>
  );
}
