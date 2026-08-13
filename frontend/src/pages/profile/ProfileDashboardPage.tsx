import { useEffect, useState, type ReactNode } from 'react';
import { Clock, Eye, FileText, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import LearningAnalyticsEntryCard from '../../components/profile/LearningAnalyticsEntryCard';
import StatsCard from '../../components/profile/StatsCard';
import {
  formatExamTitle as formatExamTitleFromSource,
} from '../../lib/exam/examDisplay';
import {
  formatDashboardScore,
  formatDashboardSubmittedLabel,
} from '../../features/dashboard/dashboardFormatters';
import type { DashboardRecentAttemptV1 } from '../../features/dashboard/dashboardAnalyticsTypes';
import ProfileLayout from '../../layouts/ProfileLayout';
import {
  getDashboardAnalytics,
  type DashboardAnalyticsRequest,
} from '../../services/dashboardAnalyticsApi';
import {
  getProfileLearningSummary,
  type ProfileLearningSummaryRequest,
  type ProfileLearningSummaryV1,
} from '../../services/profileLearningSummaryApi';

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

function PageHeader({ firstName }: { firstName: string }) {
  return (
    <header className="max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
        Xin chào, {firstName}!
      </h1>
    </header>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-900 transition-colors hover:bg-red-100"
    >
      Thử lại
    </button>
  );
}

function StatsGrid({
  summary,
  loading,
  error,
  onRetry,
}: {
  summary: ProfileLearningSummaryV1 | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const items: Array<{
    icon: ReactNode;
    label: string;
    value: string | number;
    color: string;
  }> = [
    {
      icon: <Eye size={18} strokeWidth={1.7} />,
      label: 'Sự kiện đã xem',
      value: summary?.eventsViewed ?? 0,
      color: 'var(--accent)',
    },
    {
      icon: <FileText size={18} strokeWidth={1.7} />,
      label: 'Quiz AI hoàn thành',
      value: summary?.quizzesCompleted ?? 0,
      color: 'var(--admin-accent-text)',
    },
    {
      icon: <Flame size={18} strokeWidth={1.7} />,
      label: 'Chuỗi hiện tại',
      value: `${summary?.streakDays ?? 0} ngày`,
      color: 'var(--accent)',
    },
    {
      icon: <Clock size={18} strokeWidth={1.7} />,
      label: 'Thời gian luyện thi',
      value: `${summary?.totalMinutes ?? 0} phút`,
      color: 'var(--text-secondary)',
    },
  ];

  return (
    <section
      aria-busy={loading}
      aria-labelledby="learning-summary-heading"
      className="min-w-0 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm"
    >
      <h2 id="learning-summary-heading" className="sr-only">Chỉ số học tập</h2>

      {loading && <p role="status" className="sr-only">Đang tải các chỉ số học tập…</p>}

      {!loading && error ? (
        <div
          role="alert"
          className="flex min-h-32 flex-col justify-center gap-4 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold text-red-950">Chưa thể tải các chỉ số học tập.</p>
            <p className="mt-1 text-sm text-red-900">{error}</p>
          </div>
          <RetryButton onRetry={onRetry} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {items.map((item) => (
            <StatsCard
              key={item.label}
              icon={item.icon}
              label={item.label}
              value={item.value}
              color={item.color}
              loading={loading}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecentAttempts({
  attempts,
  loading,
  failed,
  onRetry,
}: {
  attempts: DashboardRecentAttemptV1[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const visibleAttempts = attempts.slice(0, 3);

  return (
    <section
      aria-busy={loading}
      aria-labelledby="recent-attempts-heading"
      className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <header>
        <h2 id="recent-attempts-heading" className="text-lg font-bold text-stone-900">
          Bài thi gần đây
        </h2>
        <p className="mt-1 text-sm text-stone-500">Trong 30 ngày qua</p>
      </header>

      {loading && (
        <div className="mt-5" role="status">
          <span className="sr-only">Đang tải bài thi gần đây…</span>
          <div aria-hidden="true" className="divide-y divide-stone-100">
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex min-h-16 animate-pulse items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-3/5 rounded bg-stone-200" />
                  <div className="h-3 w-2/5 rounded bg-stone-100" />
                </div>
                <div className="h-5 w-16 rounded bg-stone-200" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && failed && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-950">Chưa thể tải bài thi gần đây.</p>
          <p className="mt-1 text-sm leading-6 text-red-900">
            Các chỉ số hồ sơ vẫn có thể sử dụng. Hãy thử tải lại danh sách bài thi.
          </p>
          <div className="mt-4">
            <RetryButton onRetry={onRetry} />
          </div>
        </div>
      )}

      {!loading && !failed && visibleAttempts.length === 0 && (
        <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="font-semibold text-stone-800">Chưa có bài thi trong 30 ngày qua.</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Hãy hoàn thành một đề thi THPT để kết quả xuất hiện tại đây.
          </p>
          <Link
            to="/exams/browse"
            className="mt-3 inline-flex min-h-11 items-center rounded-lg font-semibold text-red-900 no-underline"
          >
            Chọn đề để bắt đầu
          </Link>
        </div>
      )}

      {!loading && !failed && visibleAttempts.length > 0 && (
        <>
          <div className="mt-4 divide-y divide-stone-100">
            {visibleAttempts.map((attempt) => (
              <Link
                key={attempt.attemptId}
                to={`/exams/ket-qua/${encodeURIComponent(attempt.attemptId)}`}
                className="group grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-inherit no-underline"
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold leading-5 text-stone-900 group-hover:text-red-900">
                    {formatExamTitleFromSource({ title: attempt.title })}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    {formatDashboardSubmittedLabel(attempt.submittedAt)} · {attempt.totalQuestions} câu
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-base font-bold tabular-nums text-red-900 sm:text-lg">
                  {formatDashboardScore(attempt.score)}/10
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-3 border-t border-stone-200 pt-3">
            <Link
              to="/exams/lich-su"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-red-900 no-underline"
            >
              Xem toàn bộ lịch sử thi
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function NextActions() {
  const actions = [
    {
      to: '/exams/browse',
      label: 'Làm đề THPT',
      description: 'Chọn đề và bắt đầu luyện thi',
    },
    {
      to: '/quiz/generate',
      label: 'Trắc nghiệm AI',
      description: 'Tạo bộ câu hỏi theo chủ đề',
    },
  ] as const;

  return (
    <section
      aria-labelledby="next-actions-heading"
      className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 id="next-actions-heading" className="text-lg font-bold text-stone-900">
        Bước học tiếp theo
      </h2>
      <p className="mt-1 text-sm leading-6 text-stone-500">
        Chọn một hoạt động để tiếp tục học tập.
      </p>

      <div className="mt-4 space-y-3">
        {actions.map((action, index) => (
          <Link
            key={action.to}
            to={action.to}
            className={`flex min-h-11 items-center rounded-xl border px-4 py-3 no-underline transition-colors ${
              index === 0
                ? 'border-red-900 bg-red-900 text-white hover:bg-red-950'
                : 'border-stone-200 bg-stone-50 text-stone-900 hover:border-red-200 hover:bg-red-50'
            }`}
          >
            <span className="min-w-0">
              <span className="block font-semibold">{action.label}</span>
              <span className={`mt-0.5 block text-xs ${index === 0 ? 'text-red-100' : 'text-stone-500'}`}>
                {action.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
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
        setSummaryError(null);
      } else {
        setSummary(null);
        setSummaryError('Vui lòng kiểm tra kết nối và thử lại.');
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

  const retryDashboard = () => {
    setLoading(true);
    setSummary(null);
    setSummaryError(null);
    setDashboard(EMPTY_DASHBOARD_STATE);
    setReloadKey((value) => value + 1);
  };

  return (
    <ProfileLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader firstName={firstName} />

        <StatsGrid
          summary={summary}
          loading={loading}
          error={summaryError}
          onRetry={retryDashboard}
        />

        <LearningAnalyticsEntryCard />

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,0.9fr)] lg:gap-6">
          <RecentAttempts
            attempts={dashboard.recentAttempts}
            loading={loading}
            failed={dashboard.failed}
            onRetry={retryDashboard}
          />
          <NextActions />
        </div>
      </div>
    </ProfileLayout>
  );
}
