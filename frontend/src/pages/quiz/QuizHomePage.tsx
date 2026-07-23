import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  ChartNoAxesCombined,
  ClipboardList,
  History,
  Target,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import PublicPageHeader from '../../components/public/PublicPageHeader';
import * as quizService from '../../services/quizService';

/**
 * Displays a statistic with its label and icon.
 *
 * @param label - The text describing the statistic
 * @param value - The statistic value to display
 * @param icon - The icon component displayed alongside the statistic
 */
function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof ClipboardList;
}) {
  return (
    <div className="quiz-stat-card">
      <span className="quiz-preview-icon"><Icon size={19} aria-hidden="true" /></span>
      <div>
        <strong className="app-heading">{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

/**
 * Renders a card that links to a destination and presents an icon, title, and description.
 *
 * @param to - The destination route for the card.
 * @param title - The card's title.
 * @param description - Supporting text displayed below the title.
 * @param icon - The icon component displayed on the card.
 */
function ActionCard({
  to,
  title,
  description,
  icon: Icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: typeof BrainCircuit;
}) {
  return (
    <Link to={to} className="public-card group block p-5 no-underline transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]">
      <span className="quiz-preview-icon"><Icon size={20} aria-hidden="true" /></span>
      <h3 className="app-heading mt-4 text-2xl font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
        Khám phá <ArrowRight size={15} aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * Renders the quiz landing page with practice options and learning progress.
 */
export default function QuizHomePage() {
  const { isAuthenticated, currentUser } = useAuth();
  const [attemptCount, setAttemptCount] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [avgScore, setAvgScore] = useState(0);

  useEffect(() => {
    let cancelled = false;
    quizService.getQuizHistory(currentUser?.id).then(history => {
      if (cancelled) return;
      setAttemptCount(history.length);
      setTotalQuestions(history.reduce((total, result) => total + result.totalQuestions, 0));
      setAvgScore(history.length
        ? Math.round((history.reduce((total, result) => total + result.score10, 0) / history.length) * 10) / 10
        : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  return (
    <div className="public-shell quiz-shell">
      <main className="public-content space-y-10">
        <PublicPageHeader
          eyebrow="Ôn luyện lịch sử"
          title="Trắc nghiệm lịch sử với AI"
          description="Tạo bài luyện tập bằng AI từ nguồn SGK Lịch sử lớp 10–12 và theo dõi tiến độ học tập của bạn."
          showBack
          action={(
            <span className="inline-flex items-center gap-2 rounded-[var(--admin-radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
              <UserRound size={15} aria-hidden="true" />
              {isAuthenticated ? currentUser?.fullName || 'Học sinh' : 'Chế độ khách'}
            </span>
          )}
        />

        <section className="quiz-hero">
          <div className="relative z-10 max-w-2xl">
            <h2 className="app-heading mt-2 text-4xl font-bold text-[var(--text-primary)] sm:text-5xl">
              Luyện đúng trọng tâm, hiểu rõ từng đáp án
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
              Nhập chủ đề, chọn độ khó và số câu. Mỗi kết quả đều có lời giải cùng nguồn SGK để bạn tự học hiệu quả hơn.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/quiz/generate" className="public-primary-button no-underline">
                <BrainCircuit size={17} aria-hidden="true" /> Tạo bài trắc nghiệm
              </Link>
              <Link to="/quiz/history" className="public-secondary-button no-underline">
                <History size={17} aria-hidden="true" /> Xem lịch sử
              </Link>
            </div>
          </div>
          <div className="quiz-hero-mark" aria-hidden="true"><BookOpenCheck size={150} strokeWidth={0.7} /></div>
        </section>

        <section>
          <div className="mb-5">
            <p className="public-eyebrow">Tiến độ thực tế</p>
            <h2 className="app-heading mt-2 text-3xl font-bold">Kết quả học tập của bạn</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Bài đã hoàn thành" value={attemptCount} icon={ClipboardList} />
            <StatCard label="Câu đã làm" value={totalQuestions} icon={Target} />
            <StatCard label="Điểm trung bình" value={avgScore ? `${avgScore}/10` : '—'} icon={ChartNoAxesCombined} />
          </div>
        </section>

        <section>
          <div className="mb-5">
            <p className="public-eyebrow">Không gian học tập</p>
            <h2 className="app-heading mt-2 text-3xl font-bold">Chọn hoạt động</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <ActionCard
              to="/quiz/generate"
              title="Tạo bài mới"
              description="Nhập chủ đề, chọn độ khó và số lượng câu hỏi cần luyện tập."
              icon={BrainCircuit}
            />
            <ActionCard
              to="/quiz/history"
              title="Lịch sử làm bài"
              description="Xem lại điểm số, lời giải và các nguồn kiến thức của những bài đã hoàn thành."
              icon={History}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
