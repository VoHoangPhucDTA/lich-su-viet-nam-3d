/**
 * Timed V2 exam session orchestration.
 * Route: /exams/de/:examId
 */
import { useCallback, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ExamAnswerSheet from '@/components/exams/ExamAnswerSheet';
import ExamBackLink from '@/components/exams/ExamBackLink';
import ExamNavigation from '@/components/exams/ExamNavigation';
import ExamQuestionNavigator from '@/components/exams/ExamQuestionNavigator';
import ExamQuestionRenderer from '@/components/exams/ExamQuestionRenderer';
import ExamSessionHeader from '@/components/exams/ExamSessionHeader';
import ExamShortcutHelp, { type ExamShortcutItem } from '@/components/exams/ExamShortcutHelp';
import ExamSubmitDialog from '@/components/exams/ExamSubmitDialog';
import { formatExamTitle, getExamDisplayYear, getExamSourceLabel } from '@/lib/exam/examDisplay';
import { syncAttemptBestEffort } from '@/lib/exam/examAttemptSync';
import { useExamKeyboardShortcuts } from '@/lib/exam/useExamKeyboardShortcuts';
import { useQuestionNavigation } from '@/lib/exam/useQuestionNavigation';
import { getExamDeadlineMs } from '@/lib/exam/examDuration';
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
  const answerSheetCloseReasonRef = useRef<'dismiss' | 'select-question'>('dismiss');
  const getAnswerSheetCloseReason = useCallback(() => answerSheetCloseReasonRef.current, []);
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
    partialCount,
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

  const navigateToQuestion = useQuestionNavigation({ questionCount: flatQuestions.length, onIndexChange: handleNavigate, questionRef: questionTopRef });

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
    onSelectOptionByIndex: (index) => {
      if (currentQuestion?.questionType === 'mcq') {
        const option = currentQuestion.options[index];
        if (option) handleMCQSelect(currentQuestion.id, option.id);
      }
    },
    mode: 'timed',
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
  const deadlineMs = getExamDeadlineMs(session.startedAt, session.durationSeconds);

  return (
    <div className="exam-session-page">
      <ExamSessionHeader
        backLink={<ExamBackLink to="/exams/browse">Quay lại danh sách đề</ExamBackLink>}
        title={displayTitle}
        meta={displayMeta}
        durationMinutes={durationMinutes}
        currentIndex={currentIndex}
        totalQuestions={flatQuestions.length}
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
          <div ref={questionTopRef} className="exam-session-question-anchor" tabIndex={-1} data-exam-current-question />
          <button
            ref={answerSheetTriggerRef}
            type="button"
            className="exam-focusable exam-answer-sheet-trigger"
            aria-expanded={answerSheetOpen}
            aria-controls={answerSheetId}
            onClick={() => {
              answerSheetCloseReasonRef.current = 'dismiss';
              setAnswerSheetOpen(true);
            }}
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
        onClose={() => {
          answerSheetCloseReasonRef.current = 'dismiss';
          setAnswerSheetOpen(false);
        }}
        triggerRef={answerSheetTriggerRef}
        getCloseReason={getAnswerSheetCloseReason}
      >
        <ExamQuestionNavigator
          questions={flatQuestions}
          currentIndex={currentIndex}
          questionStates={questionStates}
          onQuestionSelect={(index) => {
            answerSheetCloseReasonRef.current = 'select-question';
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
        description="Bài thi có giới hạn thời gian và sẽ tự động nộp khi hết giờ."
        notes="Mũi tên lên/xuống và Home/End đổi đáp án trong câu trắc nghiệm. Enter và Space giữ hành vi mặc định của điều khiển đang focus."
      />

      <ExamSubmitDialog
        isOpen={dialogOpen}
        totalQuestions={flatQuestions.length}
        completedCount={completedCount}
        partialCount={partialCount}
        untouchedCount={incompleteCount - partialCount}
        flaggedCount={session.flagged.length}
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
        <ExamBackLink to="/exams/browse">Quay lại danh sách đề</ExamBackLink>
      </div>
    </div>
  );
}

const TIMED_SHORTCUTS: ExamShortcutItem[] = [
  { keyLabel: '← / →', description: 'Chuyển câu, kể cả khi đang focus đáp án' },
  { keyLabel: '↑ / ↓', description: 'Chuyển giữa các đáp án trắc nghiệm' },
  { keyLabel: '1–4', description: 'Chọn nhanh đáp án A–D' },
  { keyLabel: 'Shift + F', description: 'Đánh dấu hoặc bỏ đánh dấu xem lại' },
  { keyLabel: '?', description: 'Mở hướng dẫn làm bài' },
];
