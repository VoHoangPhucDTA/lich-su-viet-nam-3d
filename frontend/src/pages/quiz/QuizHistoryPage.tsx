import { ArrowRight, Clock3, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import PublicPageHeader from '../../components/public/PublicPageHeader';
import EmptyState from '../../components/shared/EmptyState';
import LoadingState from '../../components/shared/LoadingState';
import MuseumSelect, { type MuseumSelectOption } from '../../components/shared/MuseumSelect';
import * as quizService from '../../services/quizService';
import type { QuizResult } from '../../types/quiz';

function formatTime(ms: number) {
  const minutes = Math.round(ms / 60000);
  return minutes < 1 ? '< 1 phút' : `${minutes} phút`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const DIFFICULTY_OPTIONS: MuseumSelectOption<string>[] = [
  { value: 'all', label: 'Tất cả độ khó' },
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
];

const DIFFICULTY_LABELS: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' };

export default function QuizHistoryPage() {
  const { currentUser } = useAuth();
  const [history, setHistory] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDifficulty, setFilterDifficulty] = useState('all');

  useEffect(() => {
    let cancelled = false;
    quizService.getQuizHistory(currentUser?.id).then(data => {
      if (!cancelled) {
        setHistory(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const filteredHistory = history.filter(item => {
    if (filterDifficulty !== 'all' && item.config.difficulty !== filterDifficulty) return false;
    return true;
  });

  return (
    <div className="public-shell quiz-shell">
      <main className="public-content-narrow space-y-7">
        <PublicPageHeader
          eyebrow="Tiến độ học tập"
          title="Lịch sử làm bài"
          description="Xem lại các phiên trắc nghiệm đã hoàn thành và mở báo cáo chi tiết."
          showBack
          backFallback="/quiz"
          action={<Link to="/quiz/generate" className="public-primary-button no-underline">Tạo bài mới</Link>}
        />

        <section className="public-toolbar">
          <div className="grid gap-3 sm:grid-cols-2">
            <MuseumSelect
              value={filterDifficulty}
              options={DIFFICULTY_OPTIONS}
              onValueChange={setFilterDifficulty}
              label="Lọc theo độ khó"
            />
          </div>
        </section>

        {loading ? (
          <LoadingState label="Đang tải lịch sử làm bài..." />
        ) : history.length === 0 ? (
          <div className="public-card">
            <EmptyState
              icon={<History size={25} aria-hidden="true" />}
              title="Bạn chưa có lịch sử làm bài"
              description="Các bài trắc nghiệm đã hoàn thành sẽ xuất hiện tại đây."
            />
            <div className="-mt-10 flex justify-center pb-10">
              <Link to="/quiz/generate" className="public-primary-button no-underline">Tạo bài đầu tiên</Link>
            </div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="public-card">
            <EmptyState title="Không có kết quả phù hợp" description="Hãy thay đổi bộ lọc độ khó." />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map(item => (
              <article key={item.resultId} className="quiz-history-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{formatDate(item.completedAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden="true" />{formatTime(item.totalTimeMs)}</span>
                  </div>
                  <h2 className="serif-heading mt-2 text-xl font-bold text-[var(--text-primary)]">
                    {item.config.query || 'Bài luyện tập tổng hợp'}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="quiz-badge">{item.totalQuestions} câu</span>
                    <span className="quiz-badge">{DIFFICULTY_LABELS[item.config.difficulty] ?? item.config.difficulty}</span>
                  </div>
                </div>
                <div className="quiz-history-score">
                  <strong className="serif-heading">{item.score10}</strong>
                  <span>điểm</span>
                </div>
                <div className="quiz-history-correct">
                  <strong>{item.correctCount}/{item.totalQuestions}</strong>
                  <span>câu đúng</span>
                </div>
                <Link to={`/quiz/result/${item.sessionId}`} className="public-secondary-button no-underline">
                  Xem lại <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
