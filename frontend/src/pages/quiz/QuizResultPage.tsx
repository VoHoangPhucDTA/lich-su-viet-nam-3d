import {
  ArrowUp,
  BookOpen,
  CircleCheck,
  CircleMinus,
  CircleX,
  Download,
  ExternalLink,
  History,
  Lightbulb,
  Target,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PublicPageHeader from '../../components/public/PublicPageHeader';
import EmptyState from '../../components/shared/EmptyState';
import LoadingState from '../../components/shared/LoadingState';
import * as quizService from '../../services/quizService';
import type { QuizQuestionResult, QuizResult } from '../../types/quiz';

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes} phút ${seconds} giây` : `${seconds} giây`;
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

function ResultMetric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="quiz-result-metric">
      <strong className="serif-heading" style={{ color: tone }}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function AnswerReviewCard({ result, index }: { result: QuizQuestionResult; index: number }) {
  const question = result.question;
  const skipped = result.selectedOptionId === null;
  const statusLabel = skipped ? 'Chưa trả lời' : result.isCorrect ? 'Đúng' : 'Sai';
  const StatusIcon = skipped ? CircleMinus : result.isCorrect ? CircleCheck : CircleX;
  const statusClass = skipped ? 'quiz-review-skipped' : result.isCorrect ? 'quiz-review-correct' : 'quiz-review-wrong';

  return (
    <article className={`quiz-review-card ${statusClass}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="quiz-review-number">{index + 1}</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold">
            <StatusIcon size={16} aria-hidden="true" />{statusLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {question.topic && <span className="quiz-badge">{question.topic}</span>}
          <span className="quiz-badge">{question.difficulty}</span>
        </div>
      </header>

      <h3 className="serif-heading text-xl font-bold leading-8 text-[var(--text-primary)]">{question.questionText}</h3>
      <div className="space-y-2">
        {question.options.map(option => {
          const correct = question.correctOptionId === option.id;
          const selectedWrong = result.selectedOptionId === option.id && !correct;
          return (
            <div key={option.id} className={`quiz-review-option ${correct ? 'quiz-review-option-correct' : ''} ${selectedWrong ? 'quiz-review-option-wrong' : ''}`}>
              <strong>{option.id}</strong>
              <span>{option.text}</span>
              {correct && <CircleCheck size={16} aria-label="Đáp án đúng" />}
              {selectedWrong && <CircleX size={16} aria-label="Đáp án đã chọn" />}
            </div>
          );
        })}
      </div>

      <section className="quiz-explanation">
        <h4><Lightbulb size={17} aria-hidden="true" />Giải thích</h4>
        <p>{question.explanation}</p>
        {question.sourceRefs.length > 0 && (
          <div className="mt-3">
            <p className="public-field-label">Nguồn tham khảo</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {question.sourceRefs.map((source, sourceIndex) => (
                <span key={`${source.title}-${sourceIndex}`} className="quiz-source-chip">
                  <BookOpen size={13} aria-hidden="true" />{source.title} · {source.location}
                </span>
              ))}
            </div>
          </div>
        )}
        {question.eventId && (
          <Link to={`/events/${question.eventId}`} className="public-secondary-button mt-4 no-underline">
            Xem sự kiện liên quan <ExternalLink size={14} aria-hidden="true" />
          </Link>
        )}
      </section>
    </article>
  );
}

export default function QuizResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'skipped'>('all');

  useEffect(() => {
    let cancelled = false;
    async function fetchResult() {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      const response = await quizService.getQuizResult(sessionId);
      if (!cancelled) {
        setResult(response);
        setLoading(false);
      }
    }
    void fetchResult();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleMockExport = (type: string) => {
    window.alert(`Tính năng xuất file ${type} sẽ được tích hợp ở phiên bản hệ thống có backend thực tế.`);
  };

  if (loading) {
    return <div className="public-shell quiz-shell"><LoadingState label="Đang tạo báo cáo kết quả..." /></div>;
  }

  if (!result) {
    return (
      <div className="public-shell quiz-shell">
        <main className="public-content-narrow">
          <div className="public-card">
            <EmptyState title="Không tìm thấy kết quả" description="Phiên làm bài không tồn tại hoặc chưa được nộp." />
            <div className="-mt-10 flex justify-center pb-10">
              <Link to="/quiz" className="public-primary-button no-underline">Về trắc nghiệm AI</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const weakTopics = Array.from(new Set(
    result.questionResults.filter(item => !item.isCorrect).map(item => item.question.topic).filter(Boolean)
  ));
  const filteredQuestions = result.questionResults.filter(item => {
    if (filter === 'correct') return item.isCorrect;
    if (filter === 'wrong') return !item.isCorrect && item.selectedOptionId !== null;
    if (filter === 'skipped') return item.selectedOptionId === null;
    return true;
  });
  const level = result.score10 >= 8 ? 'Xuất sắc' : result.score10 >= 5 ? 'Khá' : 'Cần ôn thêm';

  return (
    <div className="public-shell quiz-shell">
      <main className="public-content-narrow space-y-7">
        <PublicPageHeader
          eyebrow="Báo cáo học tập"
          title="Kết quả bài trắc nghiệm"
          description={`Hoàn thành lúc ${formatDate(result.completedAt)} · ${formatTime(result.totalTimeMs)}`}
          showBack
          backFallback="/quiz"
          action={(
            <button type="button" onClick={() => navigate('/quiz/history')} className="public-secondary-button">
              <History size={16} aria-hidden="true" /> Xem lịch sử
            </button>
          )}
        />

        <section className="quiz-result-summary">
          <div>
            <span className="quiz-badge">{level}</span>
            <h2 className="serif-heading mt-3 text-3xl font-bold">Bạn đã hoàn thành bài luyện tập</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Xem lại từng câu, lời giải và nguồn tham khảo để củng cố phần kiến thức còn thiếu.
            </p>
          </div>
          <div className="quiz-result-score">
            <strong className="serif-heading">{result.score10}</strong>
            <span>trên thang 10</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResultMetric label="Câu đúng" value={result.correctCount} tone="var(--success)" />
          <ResultMetric label="Câu sai" value={result.incorrectCount} tone="var(--danger)" />
          <ResultMetric label="Bỏ trống" value={result.skippedCount} tone="var(--text-muted)" />
          <ResultMetric label="Độ chính xác" value={`${result.percentageScore}%`} tone="var(--accent)" />
        </div>

        {weakTopics.length > 0 && (
          <section className="quiz-recommendation">
            <div className="flex items-center gap-2">
              <Target size={18} aria-hidden="true" />
              <h2 className="serif-heading text-2xl font-bold">Gợi ý ôn tập</h2>
            </div>
            <p className="mt-2 text-sm leading-6">Bạn nên xem lại các chủ đề sau trước khi tạo bài mới:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {weakTopics.map(topic => <span key={topic} className="quiz-source-chip">{topic}</span>)}
            </div>
            <Link to="/quiz/generate?mode=weakness" className="public-primary-button mt-4 no-underline">Tạo bài ôn điểm yếu</Link>
          </section>
        )}

        <section>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="public-eyebrow">Đáp án và lời giải</p>
              <h2 className="serif-heading mt-1 text-3xl font-bold">Chi tiết {filteredQuestions.length} câu</h2>
            </div>
            <div className="quiz-result-filter" role="group" aria-label="Lọc kết quả câu hỏi">
              {([
                ['all', 'Tất cả'],
                ['correct', 'Đúng'],
                ['wrong', 'Sai'],
                ['skipped', 'Bỏ trống'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={filter === value ? 'active' : ''}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {filteredQuestions.length === 0 ? (
            <div className="public-card"><EmptyState title="Không có câu hỏi" description="Không có câu hỏi nào thuộc trạng thái đang chọn." /></div>
          ) : (
            <div className="space-y-4">
              {filteredQuestions.map(item => (
                <AnswerReviewCard
                  key={item.question.id}
                  result={item}
                  index={result.questionResults.findIndex(candidate => candidate.question.id === item.question.id)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-center gap-3 border-t border-[var(--border)] pt-6">
          <button type="button" onClick={() => handleMockExport('PDF')} className="public-secondary-button">
            <Download size={15} aria-hidden="true" /> Xuất PDF
          </button>
          <button type="button" onClick={() => handleMockExport('Excel')} className="public-secondary-button">
            <Download size={15} aria-hidden="true" /> Xuất Excel
          </button>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="public-secondary-button">
            <ArrowUp size={15} aria-hidden="true" /> Lên đầu trang
          </button>
        </div>
      </main>
    </div>
  );
}
