import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import ExamHero from '../../components/exams/ExamHero';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '../../features/dashboard/dashboardRoute';
import { formatExamDuration } from '../../lib/exam/durationFormat';
import { formatExamTitle } from '../../lib/exam/examDisplay';
import {
  listExamAttempts,
  type ExamAttemptSummaryResponse,
} from '../../services/examAttemptApi';

type FeatureCardProps = {
  title: string;
  desc: string;
  to: string;
  ariaLabel?: string;
  primary?: boolean;
};

type RecentAttemptState = {
  userId: string | null;
  status: 'loading' | 'ready' | 'error';
  attempt: ExamAttemptSummaryResponse | null;
};

function FeatureCard({ title, desc, to, ariaLabel, primary = false }: FeatureCardProps) {
  return (
    <Link
      aria-label={ariaLabel}
      className={`exam-focusable exam-home-feature${primary ? ' exam-home-feature-primary' : ''}`}
      to={to}
    >
      <span>
        <h3>{title}</h3>
        <p>{desc}</p>
      </span>
    </Link>
  );
}

function formatAttemptScore(score: number | string): string {
  const numericScore = Number(score);
  return Number.isFinite(numericScore)
    ? numericScore.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
    : String(score);
}

function formatSubmittedAt(submittedAt: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(submittedAt));
}

export default function ExamHomePage() {
  const { currentUser, isLoading: isAuthLoading } = useAuth();
  const currentUserId = currentUser?.id ?? null;
  const isAuthenticated = currentUserId !== null;
  const [recentState, setRecentState] = useState<RecentAttemptState>({
    userId: null,
    status: 'loading',
    attempt: null,
  });
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let isCurrentRequest = true;

    if (isAuthLoading || !currentUserId) {
      return () => {
        isCurrentRequest = false;
      };
    }

    void listExamAttempts(1)
      .then(({ items }) => {
        if (!isCurrentRequest) return;
        setRecentState({ userId: currentUserId, status: 'ready', attempt: items[0] ?? null });
      })
      .catch(() => {
        if (!isCurrentRequest) return;
        setRecentState({ userId: currentUserId, status: 'error', attempt: null });
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [currentUserId, isAuthLoading, retryVersion]);

  const isRecentLoading = isAuthLoading
    || (isAuthenticated && (recentState.userId !== currentUserId || recentState.status === 'loading'));

  return (
    <div className="exam-home-page">
      <main className="exam-home-main">
        <ExamHero />

        <section className="exam-home-features" aria-labelledby="exam-home-features-title">
          <h2 id="exam-home-features-title">Bắt đầu luyện</h2>
          <div className="exam-home-feature-grid">
            <FeatureCard
              primary
              title="Ngân hàng đề"
              desc="Chọn đề từ kho dữ liệu và luyện theo cấu trúc thi THPT."
              to="/exams/browse"
            />
            <FeatureCard
              title="Ôn theo chủ đề"
              desc="Luyện câu hỏi theo từng mảng kiến thức và giai đoạn lịch sử."
              to="/exams/on-chu-de"
            />
            <FeatureCard
              title="Tạo đề tùy chọn"
              desc="Chọn số câu, chủ đề, độ khó và thời gian phù hợp với mục tiêu của bạn."
              to="/exams/tao-de"
            />
          </div>
        </section>

        <div className="mt-10 grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)]">
          <section aria-labelledby="exam-home-recent-title">
            <h2
              id="exam-home-recent-title"
              className="mb-4"
              style={{ fontSize: 'var(--type-section-title)', fontWeight: 'var(--weight-section-heading)' }}
            >
              Bài gần nhất
            </h2>
            <div className="min-h-56 rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow)] sm:p-6">
              {isRecentLoading && (
                <div className="flex min-h-44 items-center justify-center" role="status" aria-live="polite">
                  <p className="text-sm text-[var(--text-secondary)]">Đang tải bài gần nhất…</p>
                </div>
              )}

              {!isAuthLoading && !isAuthenticated && (
                <div className="flex min-h-44 flex-col items-start justify-center">
                  <h3 className="mb-2 text-[var(--type-card-title)] font-bold">Đăng nhập để xem bài gần nhất</h3>
                  <p className="m-0 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                    Bài thi đã nộp được lưu theo tài khoản để bạn có thể mở lại kết quả.
                  </p>
                </div>
              )}

              {!isRecentLoading && isAuthenticated && recentState.status === 'error' && (
                <div className="flex min-h-44 flex-col items-start justify-center" role="alert">
                  <h3 className="mb-2 text-[var(--type-card-title)] font-bold">Không thể tải bài gần nhất</h3>
                  <p className="m-0 text-sm leading-6 text-[var(--text-secondary)]">
                    Vui lòng thử lại để tiếp tục theo dõi bài luyện thi của bạn.
                  </p>
                  <button
                    className="exam-focusable mt-4 min-h-11 rounded-[var(--control-radius)] border border-[var(--accent)] bg-[var(--bg-card)] px-4 text-sm font-bold text-[var(--accent)]"
                    type="button"
                    onClick={() => {
                      setRecentState({ userId: currentUserId, status: 'loading', attempt: null });
                      setRetryVersion((version) => version + 1);
                    }}
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {!isRecentLoading && isAuthenticated && recentState.status === 'ready' && !recentState.attempt && (
                <div className="flex min-h-44 flex-col items-start justify-center">
                  <h3 className="mb-2 text-[var(--type-card-title)] font-bold">Bạn chưa có bài thi nào.</h3>
                  <p className="m-0 text-sm leading-6 text-[var(--text-secondary)]">
                    Chọn một đề trong ngân hàng để bắt đầu luyện thi.
                  </p>
                  <Link className="exam-focusable exam-home-cta exam-home-cta-primary mt-4" to="/exams/browse">
                    Vào ngân hàng đề
                  </Link>
                </div>
              )}

              {!isRecentLoading && isAuthenticated && recentState.status === 'ready' && recentState.attempt && (
                <article>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-bold tracking-[var(--tracking-label)] text-[var(--admin-accent-text)]">
                        BÀI THI GẦN NHẤT
                      </p>
                      <h3 className="m-0 text-[var(--type-card-title)] font-bold">
                        {formatExamTitle({ title: recentState.attempt.title ?? '' }) || 'Bài thi gần nhất'}
                      </h3>
                    </div>
                    <div className="w-fit shrink-0 rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-left sm:text-right">
                      <strong className="block text-2xl font-extrabold text-[var(--accent)]">
                        {formatAttemptScore(recentState.attempt.totalScore)}/10
                      </strong>
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">Điểm</span>
                    </div>
                  </div>

                  <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-[var(--bg-surface)] p-3">
                      <dt className="text-xs font-semibold text-[var(--text-muted)]">Nộp lúc</dt>
                      <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {formatSubmittedAt(recentState.attempt.submittedAt)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-[var(--bg-surface)] p-3">
                      <dt className="text-xs font-semibold text-[var(--text-muted)]">Số câu</dt>
                      <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                        {recentState.attempt.totalQuestions} câu
                      </dd>
                    </div>
                    {recentState.attempt.durationSeconds != null && (
                      <div className="rounded-xl bg-[var(--bg-surface)] p-3">
                        <dt className="text-xs font-semibold text-[var(--text-muted)]">Thời gian làm bài</dt>
                        <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                          {formatExamDuration(recentState.attempt.durationSeconds)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <Link
                    className="exam-focusable exam-home-cta exam-home-cta-primary mt-5"
                    to={`/exams/ket-qua/${encodeURIComponent(recentState.attempt.sessionId)}`}
                  >
                    Xem kết quả
                  </Link>
                </article>
              )}
            </div>
          </section>

          <section aria-labelledby="exam-home-progress-title">
            <h2
              id="exam-home-progress-title"
              className="mb-4"
              style={{ fontSize: 'var(--type-section-title)', fontWeight: 'var(--weight-section-heading)' }}
            >
              Theo dõi tiến độ
            </h2>
            <div className="overflow-hidden rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow)]">
              {[
                {
                  title: 'Lịch sử luyện thi',
                  desc: 'Xem lại các bài đã nộp và mở kết quả chi tiết.',
                  to: '/exams/lich-su',
                },
                {
                  title: 'Phân tích luyện thi',
                  desc: 'Theo dõi xu hướng điểm và các nội dung cần ôn thêm.',
                  to: PERSONAL_LEARNING_DASHBOARD_ROUTE,
                },
              ].map(({ title, desc, to }) => (
                <Link
                  key={to}
                  className="exam-focusable flex items-start border-b border-[var(--border)] p-4 text-inherit no-underline transition last:border-b-0 hover:bg-[var(--bg-surface)]"
                  to={to}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm font-bold">{title}</strong>
                    <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
