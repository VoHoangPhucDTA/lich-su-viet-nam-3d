import { ArrowRight, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '../../features/dashboard/dashboardRoute';

export default function LearningAnalyticsEntryCard() {
  return (
    <Link
      aria-label="Xem thống kê luyện thi"
      className="group flex min-h-11 items-center gap-4 rounded-2xl border border-red-200/70 bg-gradient-to-r from-red-50 to-amber-50/70 p-5 text-inherit no-underline shadow-sm transition hover:border-red-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2 sm:p-6"
      to={PERSONAL_LEARNING_DASHBOARD_ROUTE}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-white text-red-900"
      >
        <BarChart3 size={24} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-red-900">
          Luyện thi THPT
        </span>
        <span className="mt-1 block font-serif text-lg font-bold text-stone-900">
          Thống kê luyện thi
        </span>
        <span className="mt-1 block text-sm leading-6 text-stone-600">
          Xem xu hướng điểm, chủ đề mạnh yếu và lịch sử luyện thi tại trang thống kê chuyên biệt.
        </span>
        <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-red-900">
          Xem thống kê
          <ArrowRight
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
            size={14}
            strokeWidth={2.5}
          />
        </span>
      </span>
    </Link>
  );
}
