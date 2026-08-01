import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eraser,
  Flag,
  Keyboard,
  ListChecks,
  LoaderCircle,
  Send,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import QuizMcqOptionGroup from '../../components/quiz-runner/QuizMcqOptionGroup';
import QuizInstructionsDialog from '../../components/quiz-runner/QuizInstructionsDialog';
import QuizSubmitDialog from '../../components/quiz-runner/QuizSubmitDialog';
import { AI_SELF_PRACTICE_SHORTCUTS } from '../../lib/exam/quizKeyboardShortcuts';
import { useExamKeyboardShortcuts } from '../../lib/exam/useExamKeyboardShortcuts';
import { useQuestionNavigation } from '../../lib/exam/useQuestionNavigation';
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

export default function QuizSessionPage() {
  const { currentUser } = useAuth();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deadlineReached, setDeadlineReached] = useState(false);
  const timeUpTriggered = useRef(false);
  const submitInFlight = useRef(false);
  const questionRef = useRef<HTMLDivElement>(null);
  const instructionsTriggerRef = useRef<HTMLButtonElement>(null);
  const instructionsId = useId();

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
  }, [currentUser?.id, navigate, sessionId]);

  const persistSession = useCallback((updatedSession: QuizSession) => {
    setSession(updatedSession);
    quizService.saveQuizProgress(updatedSession);
  }, []);

  const handleUpdateAnswer = (questionId: string, optionId: 'A' | 'B' | 'C' | 'D' | null) => {
    if (!session || deadlineReached || isSubmitting) return;
    const answers: QuizAnswer[] = session.answers.map(answer =>
      answer.questionId === questionId ? { ...answer, selectedOptionId: optionId } : answer
    );
    const questionStatuses: Record<string, QuestionStatus> = { ...session.questionStatuses };
    if (questionStatuses[questionId] !== 'flagged') questionStatuses[questionId] = optionId ? 'answered' : 'unanswered';
    persistSession({ ...session, answers, questionStatuses });
  };

  const toggleFlag = (questionId: string) => {
    if (!session || deadlineReached || isSubmitting) return;
    const currentStatus = session.questionStatuses[questionId];
    const answered = session.answers.some(answer => answer.questionId === questionId && answer.selectedOptionId != null);
    const nextStatus: QuestionStatus = currentStatus === 'flagged' ? (answered ? 'answered' : 'unanswered') : 'flagged';
    persistSession({
      ...session,
      questionStatuses: { ...session.questionStatuses, [questionId]: nextStatus },
    });
  };

  const setCurrentQuestion = useCallback((index: number) => {
    setSession((currentSession) => {
      if (!currentSession || index < 0 || index >= currentSession.questions.length) return currentSession;
      const updated = { ...currentSession, currentQuestionIndex: index };
      quizService.saveQuizProgress(updated);
      return updated;
    });
  }, []);

  const jumpToQuestion = useQuestionNavigation({
    questionCount: session?.questions.length ?? 0,
    onIndexChange: setCurrentQuestion,
    questionRef,
  });

  const handleSubmit = useCallback(async (force = false) => {
    if (!session || submitInFlight.current) return;
    const unanswered = session.answers.filter(answer => answer.selectedOptionId === null).length;
    if (unanswered > 0 && !force) {
      setShowConfirm(true);
      return;
    }
    submitInFlight.current = true;
    setSubmitError(null);
    setIsSubmitting(true);
    setShowConfirm(false);
    try {
      await quizService.submitQuiz(session.sessionId, session.answers, currentUser?.id);
      navigate(`/quiz/result/${session.sessionId}`, { replace: true });
    } catch {
      submitInFlight.current = false;
      setIsSubmitting(false);
      setSubmitError('Không thể nộp bài lúc này. Bài làm của bạn vẫn được giữ lại.');
    }
  }, [currentUser?.id, navigate, session]);

  const handleTimeUp = useCallback(() => {
    if (timeUpTriggered.current) return;
    timeUpTriggered.current = true;
    setDeadlineReached(true);
    setShowConfirm(false);
    void handleSubmit(true);
  }, [handleSubmit]);

  useExamKeyboardShortcuts({
    onNext: () => {
      if (session && session.currentQuestionIndex < session.questions.length - 1) {
        jumpToQuestion(session.currentQuestionIndex + 1);
      }
    },
    onPrevious: () => {
      if (session && session.currentQuestionIndex > 0) {
        jumpToQuestion(session.currentQuestionIndex - 1);
      }
    },
    onFlag: () => {
      const question = session?.questions[session.currentQuestionIndex];
      if (question) toggleFlag(question.id);
    },
    onShowHelp: () => setInstructionsOpen(true),
    onSelectOptionByIndex: (index) => {
      const question = session?.questions[session.currentQuestionIndex];
      const option = question?.options[index];
      if (question && option) handleUpdateAnswer(question.id, option.id);
    },
    onMoveOption: (direction) => {
      const question = session?.questions[session.currentQuestionIndex];
      if (!question || question.options.length === 0) return;
      const answer = session?.answers.find((item) => item.questionId === question.id);
      const selectedIndex = question.options.findIndex((option) => option.id === answer?.selectedOptionId);
      const nextIndex = selectedIndex < 0
        ? (direction > 0 ? 0 : question.options.length - 1)
        : (selectedIndex + direction + question.options.length) % question.options.length;
      const option = question.options[nextIndex];
      if (option) handleUpdateAnswer(question.id, option.id);
    },
    onClearOption: () => {
      const question = session?.questions[session.currentQuestionIndex];
      if (question) handleUpdateAnswer(question.id, null);
    },
    onSubmit: () => {
      void handleSubmit();
    },
    mode: 'timed',
    disabled: isLoading || Boolean(error) || !session || instructionsOpen || showConfirm || progressOpen || isSubmitting || deadlineReached,
  });

  useEffect(() => {
    if (!progressOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProgressOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [progressOpen]);

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
        <div className="quiz-session-actions ml-auto">
          <QuizTimer startedAt={session.startedAt} timeLimit={session.config.timeLimitMinutes} onTimeUp={handleTimeUp} />
          <button
            ref={instructionsTriggerRef}
            id={instructionsId}
            type="button"
            onClick={() => setInstructionsOpen(true)}
            aria-expanded={instructionsOpen}
            aria-controls={`${instructionsId}-dialog`}
            className="public-secondary-button quiz-instructions-trigger"
          >
            <Keyboard size={16} aria-hidden="true" /> Hướng dẫn
          </button>
          <button type="button" onClick={() => setProgressOpen(true)} className="public-secondary-button quiz-progress-toggle">
            <ListChecks size={16} aria-hidden="true" /> Tiến trình
          </button>
          <button type="button" onClick={() => void handleSubmit(false)} disabled={isSubmitting || deadlineReached} className="public-primary-button">
            {isSubmitting ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin" /> : <Send size={16} aria-hidden="true" />}
            Nộp bài
          </button>
        </div>
      </header>

      <div className="quiz-session-body">
        <main className="quiz-question-area">
          {session.generation?.partial && <div className="quiz-alert mb-4" role="status">Chỉ tạo được {session.generation.generatedCount}/{session.generation.requestedCount} câu phù hợp với nguồn SGK.</div>}
          {deadlineReached && !submitError && (
            <div className="quiz-alert mb-4" role="alert" aria-live="assertive">
              Đã hết giờ, hệ thống đang nộp bài…
            </div>
          )}
          {submitError && (
            <div className="quiz-alert quiz-submit-error mb-4" role="alert">
              <span>{submitError}</span>
              <button type="button" className="public-secondary-button" onClick={() => void handleSubmit(true)} disabled={isSubmitting}>
                Thử nộp lại
              </button>
            </div>
          )}
          <div
            ref={questionRef}
            tabIndex={-1}
            className="quiz-question-container"
            data-quiz-current-question
            aria-label={`Câu ${session.currentQuestionIndex + 1} trên ${session.questions.length}`}
          >
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

            <QuizMcqOptionGroup
              options={currentQuestion.options.map((option) => ({ id: option.id, label: option.text }))}
              selected={currentAnswer?.selectedOptionId ?? null}
              onSelect={(optionId) => handleUpdateAnswer(currentQuestion.id, optionId)}
              disabled={deadlineReached || isSubmitting}
              ariaLabel={`Lựa chọn cho câu ${session.currentQuestionIndex + 1}`}
              className="quiz-option-list"
              optionClassName={(_, selected) => `quiz-option ${selected ? 'quiz-option-selected' : ''}`}
              renderOption={(option) => (
                <>
                  <span>{option.id}</span>
                  <strong>{option.label}</strong>
                </>
              )}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleUpdateAnswer(currentQuestion.id, null)}
                disabled={!currentAnswer?.selectedOptionId || deadlineReached || isSubmitting}
                className="public-text-button"
              >
                <Eraser size={15} aria-hidden="true" /> Xóa lựa chọn
              </button>
              <button
                type="button"
                onClick={() => toggleFlag(currentQuestion.id)}
                disabled={deadlineReached || isSubmitting}
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
                <button type="button" disabled={isSubmitting || deadlineReached} onClick={() => void handleSubmit(false)} className="public-primary-button quiz-final-submit-button">
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

      <QuizSubmitDialog
        isOpen={showConfirm}
        summary={{
          total: session.questions.length,
          completed: session.answers.filter((answer) => answer.selectedOptionId !== null).length,
          unanswered: session.answers.filter((answer) => answer.selectedOptionId === null).length,
          flagged: Object.values(session.questionStatuses).filter((status) => status === 'flagged').length,
        }}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => void handleSubmit(true)}
        isSubmitting={isSubmitting}
      />
      <QuizInstructionsDialog
        id={instructionsId}
        isOpen={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        triggerRef={instructionsTriggerRef}
        shortcuts={AI_SELF_PRACTICE_SHORTCUTS}
        description="Chọn đáp án bằng chuột hoặc bàn phím. Các phím bên dưới hoạt động khi bạn không nhập nội dung trong ô văn bản."
        notes="Dùng nút Nộp bài khi đã sẵn sàng. Nếu còn câu chưa trả lời, hệ thống sẽ yêu cầu bạn xác nhận."
      />
    </div>
  );
}
