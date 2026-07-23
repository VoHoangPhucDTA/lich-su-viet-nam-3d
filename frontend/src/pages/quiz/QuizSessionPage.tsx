import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eraser,
  Flag,
  ListChecks,
  LoaderCircle,
  Send,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import * as quizService from '../../services/quizService';
import type { QuestionStatus, QuizAnswer, QuizSession } from '../../types/quiz';

function QuizTimer({
  startedAt,
  timeLimit,
  onTimeUp,
}: {
  startedAt: string;
  timeLimit: number;
  onTimeUp: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
  const onTimeUpRef = useRef(onTimeUp);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();
    const tick = () => {
      const currentElapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsed(currentElapsed);
      if (timeLimit > 0 && currentElapsed >= timeLimit * 60) onTimeUpRef.current();
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, timeLimit]);

  const seconds = timeLimit > 0 ? Math.max(0, timeLimit * 60 - elapsed) : elapsed;
  const minutesLabel = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secondsLabel = (seconds % 60).toString().padStart(2, '0');
  const warning = timeLimit > 0 && seconds < 60;

  return (
    <div className={`quiz-session-timer ${warning ? 'quiz-session-timer-warning' : ''}`} aria-label={`${minutesLabel} phút ${secondsLabel} giây`}>
      <Clock3 size={17} aria-hidden="true" />
      <span>{minutesLabel}:{secondsLabel}</span>
    </div>
  );
}

function ProgressPanel({
  session,
  onJump,
  onClose,
}: {
  session: QuizSession;
  onJump: (index: number) => void;
  onClose?: () => void;
}) {
  return (
    <div className="quiz-progress-panel">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div>
          <h2 className="text-xl font-bold">Tiến trình</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {session.answers.filter(answer => answer.selectedOptionId != null).length}/{session.questions.length} câu đã làm
          </p>
        </div>
        {onClose && (
          <button type="button" className="public-icon-button" onClick={onClose} aria-label="Đóng tiến trình">
            <X size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-5 gap-2">
          {session.questions.map((question, index) => {
            const status = session.questionStatuses[question.id];
            const current = index === session.currentQuestionIndex;
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => {
                  onJump(index);
                  onClose?.();
                }}
                aria-label={`Đi tới câu ${index + 1}, trạng thái ${status}`}
                aria-current={current ? 'step' : undefined}
                className={`quiz-progress-cell quiz-progress-${status} ${current ? 'quiz-progress-current' : ''}`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-2 border-t border-[var(--border)] p-4 text-xs text-[var(--text-muted)]">
        <p><span className="quiz-legend quiz-legend-empty" />Chưa làm</p>
        <p><span className="quiz-legend quiz-legend-answered" />Đã làm</p>
        <p><span className="quiz-legend quiz-legend-flagged" />Đánh dấu xem lại</p>
      </div>
    </div>
  );
}

/**
 * Renders the interactive quiz session page with question navigation, progress tracking, timed submission, and answer management.
 *
 * @returns The quiz session interface, loading state, or error state.
 */
export default function QuizSessionPage() {
  const { currentUser } = useAuth();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const timeUpTriggered = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      if (!sessionId) {
        setError('Không tìm thấy mã phiên làm bài.');
        setIsLoading(false);
        return;
      }
      try {
        const data = await quizService.getQuizSession(sessionId, currentUser?.id);
        if (cancelled) return;
        if (!data) setError('Không tìm thấy phiên làm bài này.');
        else if (data.submittedAt) navigate(`/quiz/result/${sessionId}`, { replace: true });
        else setSession(data);
      } catch {
        if (!cancelled) setError('Có lỗi khi tải dữ liệu bài làm.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [navigate, sessionId]);

  const persistSession = (updatedSession: QuizSession) => {
    setSession(updatedSession);
    quizService.saveQuizProgress(updatedSession);
  };

  const handleUpdateAnswer = (questionId: string, optionId: 'A' | 'B' | 'C' | 'D' | null) => {
    if (!session) return;
    const answers: QuizAnswer[] = session.answers.map(answer =>
      answer.questionId === questionId ? { ...answer, selectedOptionId: optionId } : answer
    );
    const questionStatuses: Record<string, QuestionStatus> = { ...session.questionStatuses };
    if (questionStatuses[questionId] !== 'flagged') questionStatuses[questionId] = optionId ? 'answered' : 'unanswered';
    persistSession({ ...session, answers, questionStatuses });
  };

  const toggleFlag = (questionId: string) => {
    if (!session) return;
    const currentStatus = session.questionStatuses[questionId];
    const answered = session.answers.some(answer => answer.questionId === questionId && answer.selectedOptionId != null);
    const nextStatus: QuestionStatus = currentStatus === 'flagged' ? (answered ? 'answered' : 'unanswered') : 'flagged';
    persistSession({
      ...session,
      questionStatuses: { ...session.questionStatuses, [questionId]: nextStatus },
    });
  };

  const jumpToQuestion = (index: number) => {
    if (!session || index < 0 || index >= session.questions.length) return;
    persistSession({ ...session, currentQuestionIndex: index });
  };

  const handleSubmit = useCallback(async (force = false) => {
    if (!session || isSubmitting) return;
    const unanswered = session.answers.filter(answer => answer.selectedOptionId === null).length;
    if (unanswered > 0 && !force) {
      setShowConfirm(true);
      return;
    }
    setIsSubmitting(true);
    setShowConfirm(false);
    try {
      await quizService.submitQuiz(session.sessionId, session.answers, currentUser?.id);
      navigate(`/quiz/result/${session.sessionId}`, { replace: true });
    } catch {
      window.alert('Có lỗi xảy ra khi nộp bài. Vui lòng thử lại.');
      setIsSubmitting(false);
    }
  }, [currentUser?.id, isSubmitting, navigate, session]);

  const handleTimeUp = useCallback(() => {
    if (timeUpTriggered.current) return;
    timeUpTriggered.current = true;
    window.alert('Đã hết thời gian làm bài! Hệ thống sẽ tự động nộp bài.');
    void handleSubmit(true);
  }, [handleSubmit]);

  useEffect(() => {
    if (!showConfirm && !progressOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowConfirm(false);
        setProgressOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [progressOpen, showConfirm]);

  if (isLoading) {
    return (
      <div className="quiz-session-state" role="status">
        <LoaderCircle size={30} aria-hidden="true" className="animate-spin text-[var(--accent)]" />
        <p>Đang tải bài làm...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="quiz-session-state">
        <CircleAlert size={34} aria-hidden="true" className="text-[var(--danger)]" />
        <h1 className="app-heading text-2xl font-bold">{error || 'Lỗi dữ liệu'}</h1>
        <button type="button" onClick={() => navigate('/quiz/generate')} className="public-primary-button">Tạo bài tập mới</button>
      </div>
    );
  }

  const currentQuestion = session.questions[session.currentQuestionIndex];
  const currentAnswer = session.answers.find(answer => answer.questionId === currentQuestion.id);
  const currentStatus = session.questionStatuses[currentQuestion.id];
  const isFirst = session.currentQuestionIndex === 0;
  const isLast = session.currentQuestionIndex === session.questions.length - 1;
  const difficultyLabel = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }[currentQuestion.difficulty];

  return (
    <div className="quiz-session-shell quiz-shell">
      <header className="quiz-session-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="quiz-preview-icon"><BookOpenCheck size={19} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-[var(--text-primary)]">Đề trắc nghiệm lịch sử</h1>
            <p className="text-xs text-[var(--text-muted)]">{session.questions.length} câu · Câu hỏi tạo bởi AI từ nguồn SGK</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <QuizTimer startedAt={session.startedAt} timeLimit={session.config.timeLimitMinutes} onTimeUp={handleTimeUp} />
          <button type="button" onClick={() => setProgressOpen(true)} className="public-secondary-button quiz-progress-toggle">
            <ListChecks size={16} aria-hidden="true" /> Tiến trình
          </button>
          <button type="button" onClick={() => void handleSubmit(false)} disabled={isSubmitting} className="public-primary-button">
            {isSubmitting ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin" /> : <Send size={16} aria-hidden="true" />}
            Nộp bài
          </button>
        </div>
      </header>

      <div className="quiz-session-body">
        <main className="quiz-question-area">
          {session.generation?.partial && <div className="quiz-alert mb-4" role="status">Chỉ tạo được {session.generation.generatedCount}/{session.generation.requestedCount} câu phù hợp với nguồn SGK.</div>}
          <div className="quiz-question-container">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="public-eyebrow">Câu hỏi</p>
                <h2 className="app-heading mt-1 text-3xl font-bold">
                  {session.currentQuestionIndex + 1}<span className="text-lg text-[var(--text-muted)]">/{session.questions.length}</span>
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="quiz-badge">{currentQuestion.grade === 'all' ? 'Lớp 10–12' : `Lớp ${currentQuestion.grade}`}</span>
                <span className="quiz-badge">{difficultyLabel}</span>
                {currentQuestion.topic && <span className="quiz-badge">{currentQuestion.topic}</span>}
              </div>
            </div>

            <section className="quiz-question-card">
              <p>{currentQuestion.questionText}</p>
            </section>

            <div className="quiz-option-list" role="radiogroup" aria-label={`Lựa chọn cho câu ${session.currentQuestionIndex + 1}`}>
              {currentQuestion.options.map(option => {
                const selected = currentAnswer?.selectedOptionId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleUpdateAnswer(currentQuestion.id, option.id)}
                    className={`quiz-option ${selected ? 'quiz-option-selected' : ''}`}
                  >
                    <span>{option.id}</span>
                    <strong>{option.text}</strong>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleUpdateAnswer(currentQuestion.id, null)}
                disabled={!currentAnswer?.selectedOptionId}
                className="public-text-button"
              >
                <Eraser size={15} aria-hidden="true" /> Xóa lựa chọn
              </button>
              <button
                type="button"
                onClick={() => toggleFlag(currentQuestion.id)}
                className={`public-secondary-button ${currentStatus === 'flagged' ? 'quiz-flag-active' : ''}`}
              >
                <Flag size={15} aria-hidden="true" /> {currentStatus === 'flagged' ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}
              </button>
            </div>

            <div className="quiz-question-navigation">
              <button type="button" disabled={isFirst} onClick={() => jumpToQuestion(session.currentQuestionIndex - 1)} className="public-secondary-button">
                <ChevronLeft size={16} aria-hidden="true" /> Câu trước
              </button>
              {isLast ? (
                <button type="button" disabled={isSubmitting} onClick={() => void handleSubmit(false)} className="public-primary-button quiz-final-submit-button">
                  {isSubmitting ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin" /> : <Send size={16} aria-hidden="true" />}
                  Nộp bài
                </button>
              ) : (
                <button type="button" onClick={() => jumpToQuestion(session.currentQuestionIndex + 1)} className="public-primary-button">
                  Câu tiếp <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </main>

        <aside className="quiz-progress-desktop">
          <ProgressPanel session={session} onJump={jumpToQuestion} />
        </aside>
      </div>

      {progressOpen && (
        <>
          <button type="button" className="quiz-drawer-overlay" aria-label="Đóng tiến trình" onClick={() => setProgressOpen(false)} />
          <aside className="quiz-progress-drawer">
            <ProgressPanel session={session} onJump={jumpToQuestion} onClose={() => setProgressOpen(false)} />
          </aside>
        </>
      )}

      {showConfirm && (
        <div className="quiz-dialog-backdrop" role="presentation">
          <section className="quiz-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-submit-title">
            <span className="quiz-loading-icon"><Send size={21} aria-hidden="true" /></span>
            <h2 id="quiz-submit-title" className="app-heading text-2xl font-bold">Nộp bài ngay?</h2>
            <p>
              Bạn còn <strong>{session.answers.filter(answer => answer.selectedOptionId === null).length}</strong> câu chưa trả lời.
              Bạn vẫn có thể nộp bài hoặc quay lại kiểm tra.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="public-secondary-button" onClick={() => setShowConfirm(false)}>Tiếp tục làm</button>
              <button type="button" className="public-primary-button" onClick={() => void handleSubmit(true)}>Nộp bài</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
