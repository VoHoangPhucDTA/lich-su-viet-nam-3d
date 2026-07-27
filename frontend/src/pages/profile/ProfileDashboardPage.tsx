import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Eye,
  FileText,
  Flame,
  History,
  RefreshCw,
  User,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import LearningAnalyticsEntryCard from '../../components/profile/LearningAnalyticsEntryCard';
import StatsCard from '../../components/profile/StatsCard';
import ProfileLayout from '../../layouts/ProfileLayout';
import {
  getProfileLearningSummary,
  type ProfileLearningSummaryRequest,
  type ProfileLearningSummaryV1,
} from '../../services/profileLearningSummaryApi';
import {
  getDashboardAnalytics,
  type DashboardAnalyticsRequest,
} from '../../services/dashboardAnalyticsApi';
import type { DashboardRecentAttemptV1 } from '../../features/dashboard/dashboardAnalyticsTypes';

interface ProfileDashboardPageProps {
  requestSummary?: ProfileLearningSummaryRequest;
  requestDashboard?: DashboardAnalyticsRequest;
}

interface DashboardDataState {
  recentAttempts: DashboardRecentAttemptV1[];
  failed: boolean;
}

const EMPTY_DASHBOARD_STATE: DashboardDataState = {
  recentAttempts: [],
  failed: false,
};

function WelcomeHero({
  firstName,
  streakDays,
}: {
  firstName: string;
  streakDays: number | null;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-white border border-stone-200/60 p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-red-50 text-red-900 flex items-center justify-center shrink-0 border border-red-100">
            <User size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
              Xin chào, {firstName}!
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Tiếp tục hành trình học lịch sử hôm nay
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200/60">
          <Flame size={22} strokeWidth={1.5} className="text-amber-600" />
          <div className="text-right">
            <div className="font-serif text-2xl font-bold text-amber-600">
              {streakDays ?? '—'}
            </div>
            <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-stone-400">
              Ngày liên tiếp
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsGrid({ summary }: { summary: ProfileLearningSummaryV1 | null }) {
  const items: Array<{
    icon: ReactNode;
    label: string;
    value: string | number;
    sub: string;
    color: string;
  }> = [
    {
      icon: <Eye size={16} strokeWidth={1.5} />,
      label: 'Sự kiện',
      value: summary?.eventsViewed ?? '—',
      sub: 'đã xem (không trùng)',
      color: 'var(--accent)',
    },
    {
      icon: <FileText size={16} strokeWidth={1.5} />,
      label: 'Trắc nghiệm AI',
      value: summary?.quizzesCompleted ?? '—',
      sub: 'đã hoàn thành',
      color: 'var(--warning)',
    },
    {
      icon: <Flame size={16} strokeWidth={1.5} />,
      label: 'Chuỗi học',
      value: summary ? `${summary.streakDays} ngày` : '—',
      sub: 'hoạt động liên tiếp',
      color: 'var(--accent)',
    },
    {
      icon: <Clock size={16} strokeWidth={1.5} />,
      label: 'Thời gian làm bài',
      value: summary ? `${summary.totalMinutes} phút` : '—',
      sub: 'tổng bài thi đã nộp',
      color: 'var(--text-muted)',
    },
  ];

  return (
    <section aria-label="Tổng quan học tập" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map(item => (
        <StatsCard
          key={item.label}
          icon={item.icon}
          label={item.label}
          value={item.value}
          sub={item.sub}
          color={item.color}
        />
      ))}
    </section>
  );
}

function formatSubmittedAt(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

function RecentAttempts({
  attempts,
  loading,
  failed,
}: {
  attempts: DashboardRecentAttemptV1[];
  loading: boolean;
  failed: boolean;
}) {
  return (
    <section
      aria-labelledby="recent-attempts-heading"
      className="rounded-2xl bg-white border border-stone-200/60 p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="space-y-1">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-red-900">
            Hoạt động thật
          </span>
          <h2 id="recent-attempts-heading" className="font-serif text-lg font-bold text-stone-900">
            Bài thi gần đây
          </h2>
        </div>
        <Link
          to="/exams/lich-su"
          className="inline-flex items-center gap-1 text-xs font-mono font-bold uppercase tracking-wider text-red-900 hover:text-red-700"
        >
          Xem lịch sử
          <ArrowRight size={13} strokeWidth={2.5} />
        </Link>
      </div>

      {loading && <p role="status" className="text-sm text-stone-500">Đang tải bài thi gần đây…</p>}
      {!loading && failed && (
        <p className="text-sm text-stone-500">
          Chưa thể tải lịch sử bài thi. Các chỉ số hồ sơ phía trên vẫn có thể sử dụng.
        </p>
      )}
      {!loading && !failed && attempts.length === 0 && (
        <div className="rounded-xl bg-stone-50 border border-stone-200/60 p-4">
          <p className="text-sm font-medium text-stone-700">Bạn chưa có bài thi đã nộp.</p>
          <Link
            to="/exams/browse"
            className="inline-flex items-center gap-1 mt-2 text-xs font-mono font-bold uppercase tracking-wider text-red-900"
          >
            Chọn đề để bắt đầu
            <ArrowRight size={12} />
          </Link>
        </div>
      )}
      {!loading && attempts.length > 0 && (
        <div className="space-y-2.5">
          {attempts.map(attempt => (
            <Link
              key={attempt.attemptId}
              to={`/exams/ket-qua/${encodeURIComponent(attempt.attemptId)}`}
              className="group flex items-center gap-3 rounded-xl bg-stone-50 border border-stone-200/60 p-3.5 hover:bg-white hover:shadow-sm transition-all"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-red-50 text-red-900">
                <History size={19} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-serif text-sm font-bold text-stone-900 truncate">
                  {attempt.title}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">
                  {formatSubmittedAt(attempt.submittedAt)} · {attempt.totalQuestions} câu
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-serif text-lg font-bold text-red-900">
                  {attempt.score.toFixed(2)}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400">
                  điểm
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ProfileDashboardPage({
  requestSummary = getProfileLearningSummary,
  requestDashboard = getDashboardAnalytics,
}: ProfileDashboardPageProps) {
  const { currentUser } = useAuth();
  const [summary, setSummary] = useState<ProfileLearningSummaryV1 | null>(null);
  const [dashboard, setDashboard] = useState<DashboardDataState>(EMPTY_DASHBOARD_STATE);
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const name = currentUser?.fullName ?? 'Học sinh';
  const firstName = name.split(' ').pop() ?? name;

  useEffect(() => {
    const controller = new AbortController();

    void Promise.allSettled([
      requestSummary(controller.signal),
      requestDashboard('30d', controller.signal),
    ]).then(([summaryResult, dashboardResult]) => {
      if (controller.signal.aborted) return;
      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value);
      } else {
        setSummary(null);
        setSummaryError('Không thể tải các chỉ số học tập. Vui lòng thử lại.');
      }
      if (dashboardResult.status === 'fulfilled') {
        setDashboard({
          recentAttempts: dashboardResult.value.recentAttempts,
          failed: false,
        });
      } else {
        setDashboard({ recentAttempts: [], failed: true });
      }
      setLoading(false);
    });

    return () => controller.abort();
  }, [reloadKey, requestDashboard, requestSummary]);

  return (
    <ProfileLayout>
      <div className="space-y-8 lg:space-y-10 animate-fade-in">
        <WelcomeHero firstName={firstName} streakDays={summary?.streakDays ?? null} />

        {summaryError && (
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <p className="text-sm text-red-900">{summaryError}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setSummaryError(null);
                setReloadKey(value => value + 1);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-900"
            >
              <RefreshCw size={14} />
              Thử lại
            </button>
          </div>
        )}

        {loading && !summaryError && (
          <p role="status" className="text-sm text-stone-500">Đang tải tổng quan học tập…</p>
        )}

        <StatsGrid summary={summary} />
        <LearningAnalyticsEntryCard />
        <RecentAttempts
          attempts={dashboard.recentAttempts}
          loading={loading}
          failed={dashboard.failed}
        />

        <section className="rounded-2xl border border-stone-200/60 bg-white p-5 sm:p-6">
          <h2 className="font-serif text-lg font-bold text-stone-900">Bước học tiếp theo</h2>
          <p className="mt-1 text-sm text-stone-500">
            Luyện một bộ câu hỏi AI hoặc làm đề thi để cập nhật các chỉ số bằng hoạt động thực tế.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/quiz/generate"
              className="inline-flex items-center gap-2 rounded-lg bg-red-900 px-4 py-2 text-sm font-bold text-white"
            >
              Luyện quiz AI
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/exams/browse"
              className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700"
            >
              Làm đề thi
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </div>
    </ProfileLayout>
  );
}
