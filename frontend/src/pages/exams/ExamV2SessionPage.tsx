/**
 * Timed V2 exam session orchestration.
 * Route: /exams/de/:examId
 */
import { useCallback, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ExamAnswerSheet from '@/components/exams/ExamAnswerSheet';
import ExamNavigation from '@/components/exams/ExamNavigation';
import ExamQuestionNavigator from '@/components/exams/ExamQuestionNavigator';
import ExamQuestionRenderer from '@/components/exams/ExamQuestionRenderer';
import ExamSessionHeader from '@/components/exams/ExamSessionHeader';
import ExamShortcutHelp, { type ExamShortcutItem } from '@/components/exams/ExamShortcutHelp';
import ExamSubmitDialog from '@/components/exams/ExamSubmitDialog';
import { formatExamTitle, getExamDisplayYear, getExamSourceLabel } from '@/lib/exam/examDisplay';
import { syncAttemptBestEffort } from '@/lib/exam/examAttemptSync';
import { useExamKeyboardShortcuts } from '@/lib/exam/useExamKeyboardShortcuts';
import { useSessionV2 } from '@/lib/exam/useSessionV2';
import type { TFStatement } from '@/types/exam';

const EMPTY_TF_SELECTION: Record<TFStatement['id'], boolean | null> = {
  a: null,
  b: null,
  c: null,
  d: null,
};

export default function ExamV2SessionPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const submitStartedRef = useRef(false);
  const questionTopRef = useRef<HTMLDivElement>(null);
  const answerSheetTriggerRef = useRef<HTMLButtonElement>(null);
  const shortcutHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const answerSheetId = useId();
  const shortcutHelpId = useId();

  const {
    exam,
    flatQuestions,
    currentQuestion,
    currentIndex,
    loading,
    error,
    session,
    questionStates,
    completedCount,
    incompleteCount,
    handleMCQSelect,
    handleTFSelect,
    handleClearAnswer,
    handleToggleFlag,
    handleNavigate,
    handleSubmit,
    getMCQAnswer,
    getTFAnswer,
  } = useSessionV2(examId);

  const executeSubmit = useCallback(() => {
    if (submitStartedRef.current) return;
    submitStartedRef.current = true;
    setIsSubmitting(true);

    const result = handleSubmit();
    setDialogOpen(false);
    if (result) {
      void syncAttemptBestEffort(result);
      navigate(`/exams/ket-qua/${result.sessionId}`);
      return;
    }

    submitStartedRef.current = false;
    setIsSubmitting(false);
  }, [handleSubmit, navigate]);

  const navigateToQuestion = useCallback((index: number) => {
    handleNavigate(index);
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      questionTopRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }, [handleNavigate]);

  const goToPreviousQuestion = useCallback(() => {
    if (currentIndex > 0) navigateToQuestion(currentIndex - 1);
  }, [currentIndex, navigateToQuestion]);

  const goToNextQuestion = useCallback(() => {
    if (currentIndex < flatQuestions.length - 1) navigateToQuestion(currentIndex + 1);
  }, [currentIndex, flatQuestions.length, navigateToQuestion]);

  const toggleCurrentFlag = useCallback(() => {
    if (currentQuestion) handleToggleFlag(currentQuestion.id);
  }, [currentQuestion, handleToggleFlag]);

  useExamKeyboardShortcuts({
    onPrevious: goToPreviousQuestion,
    onNext: goToNextQuestion,
    onFlag: toggleCurrentFlag,
    onShowHelp: () => setShortcutHelpOpen(true),
    disabled: loading || Boolean(error) || !exam || !currentQuestion || dialogOpen || answerSheetOpen || shortcutHelpOpen || isSubmitting,
  });

  if (loading) return <SessionLoadingState />;

  if (error || !exam || !session || !currentQuestion) {
    return <SessionErrorState message={error ?? 'Không tải được đề thi'} />;
  }

  const currentQuestionState = questionStates[currentQuestion.id];
  const displayTitle = formatExamTitle(exam);
  const displayMeta = [getExamSourceLabel(exam), getExamDisplayYear(exam) || null].filter(Boolean).join(' · ');
  const durationMinutes = Math.max(1, Math.round(session.durationSeconds / 60));
  const deadlineMs = session.startedAt + session.durationSeconds * 1000;

  return (
    <div className="exam-session-page">
      <ExamSessionHeader
        backLink={<Link to="/exams/browse" className="exam-focusable exam-session-back-link">← Danh sách đề</Link>}
        title={displayTitle}
        meta={displayMeta}
        durationMinutes={durationMinutes}
        deadlineMs={deadlineMs}
        isSubmitting={isSubmitting}
        isShortcutHelpOpen={shortcutHelpOpen}
        shortcutHelpId={shortcutHelpId}
        shortcutHelpTriggerRef={shortcutHelpTriggerRef}
        onTimeUp={executeSubmit}
        onSubmitRequest={() => {
          if (!isSubmitting) setDialogOpen(true);
        }}
        onShortcutHelpRequest={() => setShortcutHelpOpen(true)}
      />

      <main className="exam-session-main">
        <div className="exam-session-question-column">
          <div ref={questionTopRef} className="exam-session-question-anchor" />
          <button
            ref={answerSheetTriggerRef}
            type="button"
            className="exam-focusable exam-answer-sheet-trigger"
            aria-expanded={answerSheetOpen}
            aria-controls={answerSheetId}
            onClick={() => setAnswerSheetOpen(true)}
          >
            Phiếu trả lời · {completedCount}/{flatQuestions.length}
          </button>
          <ExamQuestionRenderer
            question={currentQuestion}
            index={currentIndex}
            total={flatQuestions.length}
            selectedMCQ={getMCQAnswer(currentQuestion.id)?.selected ?? null}
            selectedTF={getTFAnswer(currentQuestion.id)?.selected ?? EMPTY_TF_SELECTION}
            onMCQSelect={(optionId) => handleMCQSelect(currentQuestion.id, optionId)}
            onTFSelect={(statementId, value) => handleTFSelect(currentQuestion.id, statementId, value)}
          />
          <ExamNavigation
            currentIndex={currentIndex}
            total={flatQuestions.length}
            onNavigate={navigateToQuestion}
            questionState={currentQuestionState}
            onToggleFlag={toggleCurrentFlag}
            onClearSelection={() => handleClearAnswer(currentQuestion.id)}
            hasSelection={currentQuestionState?.hasAnyAnswer ?? false}
            onSubmit={() => {
              if (!isSubmitting) setDialogOpen(true);
            }}
            isSubmitting={isSubmitting}
          />
        </div>

        <aside className="exam-desktop-sidebar">
          <ExamQuestionNavigator
            questions={flatQuestions}
            currentIndex={currentIndex}
            questionStates={questionStates}
            onQuestionSelect={navigateToQuestion}
          />
        </aside>
      </main>

      <ExamAnswerSheet
        id={answerSheetId}
        isOpen={answerSheetOpen}
        onClose={() => setAnswerSheetOpen(false)}
        triggerRef={answerSheetTriggerRef}
      >
        <ExamQuestionNavigator
          questions={flatQuestions}
          currentIndex={currentIndex}
          questionStates={questionStates}
          onQuestionSelect={(index) => {
            setAnswerSheetOpen(false);
            navigateToQuestion(index);
          }}
        />
      </ExamAnswerSheet>

      <ExamShortcutHelp
        id={shortcutHelpId}
        isOpen={shortcutHelpOpen}
        onClose={() => setShortcutHelpOpen(false)}
        triggerRef={shortcutHelpTriggerRef}
        shortcuts={TIMED_SHORTCUTS}
      />

      <ExamSubmitDialog
        isOpen={dialogOpen}
        totalQuestions={flatQuestions.length}
        answeredCount={completedCount}
        unansweredCount={incompleteCount}
        isSubmitting={isSubmitting}
        onConfirm={executeSubmit}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}

function SessionLoadingState() {
  return (
    <div className="exam-session-loading-state">
      <div aria-hidden="true" />
      <span>Đang tải đề thi...</span>
    </div>
  );
}

function SessionErrorState({ message }: { message: string }) {
  return (
    <div className="exam-session-error-state">
      <div>
        <h2>{message}</h2>
        <Link to="/exams/browse">← Về danh sách đề</Link>
      </div>
    </div>
  );
}

const TIMED_SHORTCUTS: ExamShortcutItem[] = [
  { keyLabel: '←', description: 'Câu trước' },
  { keyLabel: '→', description: 'Câu sau' },
  { keyLabel: 'F', description: 'Đánh dấu hoặc bỏ đánh dấu xem lại' },
  { keyLabel: '?', description: 'Mở hướng dẫn phím tắt' },
];
