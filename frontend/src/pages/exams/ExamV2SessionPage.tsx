/**
 * Timed V2 exam session orchestration.
 * Route: /exams/de/:examId
 */
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ExamAnswerSheet from '@/components/exams/ExamAnswerSheet';
import ExamBackLink from '@/components/exams/ExamBackLink';
import ExamNavigation from '@/components/exams/ExamNavigation';
import ExamQuestionNavigator from '@/components/exams/ExamQuestionNavigator';
import ExamQuestionRenderer from '@/components/exams/ExamQuestionRenderer';
import ExamSessionHeader from '@/components/exams/ExamSessionHeader';
import ExamShortcutHelp, { type ExamShortcutItem } from '@/components/exams/ExamShortcutHelp';
import ExamSubmitDialog from '@/components/exams/ExamSubmitDialog';
import { useExamKeyboardShortcuts } from '@/lib/exam/useExamKeyboardShortcuts';
import { useQuestionNavigation } from '@/lib/exam/useQuestionNavigation';
import { useApiTimedSession } from '@/lib/exam/useApiTimedSession';
import { useSessionV2 } from '@/lib/exam/useSessionV2';
import { getExamDeadlineMs } from '@/lib/exam/examDuration';
import { formatExamTitle, getExamDisplayYear, getExamSourceLabel } from '@/lib/exam/examDisplay';
import { getExamMeta } from '@/lib/exam/manifestLoader';
import { EXAM_DATASET_BUILD_URL } from '@/lib/exam/examConstants';
import { createLocalSubmissionHash, enqueueRecovery } from '@/lib/exam/examRecoveryQueue';
import type { RecoverExamSubmissionRequest, SubmitAnswer } from '@/types/examApi';
import type { TFStatement } from '@/types/exam';

const EMPTY_TF_SELECTION: Record<TFStatement['id'], boolean | null> = {
  a: null,
  b: null,
  c: null,
  d: null,
};

export default function ExamV2SessionPage({ initialSessionId, legacyFallback }: { initialSessionId?: string; legacyFallback?: ReactNode }) {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitStartedRef = useRef(false);
  const questionTopRef = useRef<HTMLDivElement>(null);
  const answerSheetTriggerRef = useRef<HTMLButtonElement>(null);
  const answerSheetCloseReasonRef = useRef<'dismiss' | 'select-question'>('dismiss');
  const getAnswerSheetCloseReason = useCallback(() => answerSheetCloseReasonRef.current, []);
  const shortcutHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const answerSheetId = useId();
  const shortcutHelpId = useId();
  const timedRequest = useMemo(() => initialSessionId || !examId ? null : { mode: 'TIMED_ORIGINAL' as const, examId }, [examId, initialSessionId]);

  const {
    serverSession,
    draft,
    questions,
    currentQuestion,
    currentIndex,
    answers,
    loading,
    error,
    fallbackEligible,
    questionStates,
    completedCount,
    incompleteCount,
    partialCount,
    setAnswer,
    clearAnswer,
    toggleFlag,
    navigate: handleNavigate,
    submit,
  } = useApiTimedSession({
    routeKey: initialSessionId ? `CUSTOM_MOCK:${initialSessionId}` : `TIMED_ORIGINAL:${examId ?? ''}`,
    request: timedRequest,
    initialSessionId,
  });

  const executeSubmit = useCallback(async () => {
    if (submitStartedRef.current) return;
    submitStartedRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submit();
      setDialogOpen(false);
      if (result) {
        navigate(`/exams/ket-qua/${result.sessionId}`);
        return;
      }
      setSubmitError('Không thể nộp bài lúc này. Bài làm vẫn được giữ trên thiết bị.');
    } catch (submitFailure: unknown) {
      setSubmitError(submitFailure instanceof Error ? submitFailure.message : 'Không thể nộp bài lúc này. Bài làm vẫn được giữ trên thiết bị.');
    } finally {
      submitStartedRef.current = false;
      setIsSubmitting(false);
    }
  }, [navigate, submit]);

  const navigateToQuestion = useQuestionNavigation({ questionCount: questions.length, onIndexChange: handleNavigate, questionRef: questionTopRef });

  const goToPreviousQuestion = useCallback(() => {
    if (currentIndex > 0) navigateToQuestion(currentIndex - 1);
  }, [currentIndex, navigateToQuestion]);

  const goToNextQuestion = useCallback(() => {
    if (currentIndex < questions.length - 1) navigateToQuestion(currentIndex + 1);
  }, [currentIndex, navigateToQuestion, questions.length]);

  const toggleCurrentFlag = useCallback(() => {
    if (currentQuestion) toggleFlag(currentQuestion.id);
  }, [currentQuestion, toggleFlag]);

  useExamKeyboardShortcuts({
    onPrevious: goToPreviousQuestion,
    onNext: goToNextQuestion,
    onFlag: toggleCurrentFlag,
    onShowHelp: () => setShortcutHelpOpen(true),
    onSelectOptionByIndex: (index) => {
      if (currentQuestion?.question.questionType === 'mcq') {
        const option = currentQuestion.question.options[index];
        if (option) setAnswer(currentQuestion.id, 'mcq', option.id);
      }
    },
    mode: 'timed',
    disabled: loading || Boolean(error) || !serverSession || !currentQuestion || dialogOpen || answerSheetOpen || shortcutHelpOpen || isSubmitting,
  });

  if (loading) return <SessionLoadingState />;

  // A static result is only a transport fallback for the published original exam route.
  // API business errors deliberately remain visible rather than silently changing authority.
  if (fallbackEligible && legacyFallback) return <>{legacyFallback}</>;
  if (fallbackEligible && examId && !initialSessionId) {
    return <StaticTimedFallback examId={examId} />;
  }

  if (error || !serverSession || !draft || !currentQuestion) {
    return <SessionErrorState message={error ?? 'Không tải được phiên thi'} />;
  }

  const currentQuestionState = questionStates[currentQuestion.id];
  const displayTitle = formatExamTitle({ title: serverSession.title });
  const displayMeta = `Dữ liệu phiên bản ${serverSession.datasetVersion.slice(0, 12)}`;
  const durationMinutes = Math.max(1, Math.round(((serverSession.deadlineAt ?? serverSession.startedAtServer) - serverSession.startedAtServer) / 60000));
  const deadlineMs = serverSession.deadlineAt ?? serverSession.startedAtServer;
  const navigatorQuestions = questions.map((question) => ({ id: question.id, questionType: question.question.questionType }));
  const currentAnswer = answers[currentQuestion.id];
  const selectedMCQ = currentAnswer?.questionType === 'mcq' ? currentAnswer.selected : null;
  const selectedTF = currentAnswer?.questionType === 'true_false' ? currentAnswer.selected : EMPTY_TF_SELECTION;

  return (
    <div className="exam-session-page">
      <ExamSessionHeader
        backLink={<ExamBackLink to="/exams/browse">Quay lại danh sách đề</ExamBackLink>}
        title={displayTitle}
        meta={displayMeta}
        durationMinutes={durationMinutes}
        currentIndex={currentIndex}
        totalQuestions={questions.length}
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
        {submitError && <p role="alert" className="exam-session-submit-error">{submitError}</p>}
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
            Phiếu trả lời · {completedCount}/{questions.length}
          </button>
          <ExamQuestionRenderer
            question={currentQuestion.question}
            index={currentIndex}
            total={questions.length}
            selectedMCQ={selectedMCQ}
            selectedTF={selectedTF}
            onMCQSelect={(optionId) => setAnswer(currentQuestion.id, 'mcq', optionId)}
            onTFSelect={(statementId, value) => {
              const existing = currentAnswer?.questionType === 'true_false' ? currentAnswer.selected : EMPTY_TF_SELECTION;
              setAnswer(currentQuestion.id, 'true_false', { ...existing, [statementId]: value });
            }}
          />
          <ExamNavigation
            currentIndex={currentIndex}
            total={questions.length}
            onNavigate={navigateToQuestion}
            questionState={currentQuestionState}
            onToggleFlag={toggleCurrentFlag}
            onClearSelection={() => clearAnswer(currentQuestion.id)}
            hasSelection={currentQuestionState?.hasAnyAnswer ?? false}
            onSubmit={() => {
              if (!isSubmitting) setDialogOpen(true);
            }}
            isSubmitting={isSubmitting}
          />
        </div>

        <aside className="exam-desktop-sidebar">
          <ExamQuestionNavigator
            questions={navigatorQuestions}
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
          questions={navigatorQuestions}
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
        totalQuestions={questions.length}
        completedCount={completedCount}
        partialCount={partialCount}
        untouchedCount={incompleteCount - partialCount}
        flaggedCount={draft.flags.length}
        isSubmitting={isSubmitting}
        onConfirm={executeSubmit}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}

function StaticTimedFallback({ examId }: { examId: string }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const shortcutHelpTriggerRef = useRef<HTMLButtonElement>(null);
  const shortcutHelpId = useId();
  const {
    exam, flatQuestions, currentQuestion, currentIndex, loading, error, session, questionStates,
    handleMCQSelect, handleTFSelect, handleClearAnswer, handleToggleFlag, handleNavigate,
    handleSubmit, getMCQAnswer, getTFAnswer,
  } = useSessionV2(examId);

  if (loading) return <SessionLoadingState />;
  if (error || !exam || !session || !currentQuestion) return <SessionErrorState message={error ?? 'Khong tai duoc de thi'} />;

  const submit = () => {
    if (submitting) return;
    setSubmitting(true);
    const result = handleSubmit();
    if (result) {
      const localResult = { ...result, scoreAuthority: 'LOCAL_FALLBACK', timingAuthority: 'CLIENT_UNVERIFIED', submissionOrigin: 'CLIENT_FALLBACK' };
      localStorage.setItem(`v2_result_${result.sessionId}`, JSON.stringify(localResult));
      void queueStaticFallbackRecovery(examId, session.startedAt, flatQuestions, getMCQAnswer, getTFAnswer, localResult);
      navigate(`/exams/ket-qua/${result.sessionId}`);
      return;
    }
    setSubmitting(false);
  };
  const title = formatExamTitle(exam);
  const meta = [getExamSourceLabel(exam), getExamDisplayYear(exam) || null].filter(Boolean).join(' · ');
  const selectedTf = getTFAnswer(currentQuestion.id)?.selected ?? EMPTY_TF_SELECTION;

  return (
    <div className="exam-session-page">
      <ExamSessionHeader
        backLink={<ExamBackLink to="/exams/browse">Quay lại danh sách đề</ExamBackLink>}
        title={title}
        meta={meta}
        durationMinutes={Math.max(1, Math.round(session.durationSeconds / 60))}
        currentIndex={currentIndex}
        totalQuestions={flatQuestions.length}
        deadlineMs={getExamDeadlineMs(session.startedAt, session.durationSeconds)}
        isSubmitting={submitting}
        isShortcutHelpOpen={shortcutHelpOpen}
        shortcutHelpId={shortcutHelpId}
        shortcutHelpTriggerRef={shortcutHelpTriggerRef}
        onTimeUp={submit}
        onSubmitRequest={submit}
        onShortcutHelpRequest={() => setShortcutHelpOpen(true)}
      />
      <main className="exam-session-main">
        <div className="exam-session-question-column">
          <p role="status" className="exam-session-submit-error">Đang dùng dữ liệu lưu trên thiết bị vì máy chủ chưa truy cập được.</p>
          <ExamQuestionRenderer
            question={currentQuestion}
            index={currentIndex}
            total={flatQuestions.length}
            selectedMCQ={getMCQAnswer(currentQuestion.id)?.selected ?? null}
            selectedTF={selectedTf}
            onMCQSelect={(optionId) => handleMCQSelect(currentQuestion.id, optionId)}
            onTFSelect={(statementId, value) => handleTFSelect(currentQuestion.id, statementId, value)}
          />
          <ExamNavigation
            currentIndex={currentIndex}
            total={flatQuestions.length}
            onNavigate={handleNavigate}
            questionState={questionStates[currentQuestion.id]}
            onToggleFlag={() => handleToggleFlag(currentQuestion.id)}
            onClearSelection={() => handleClearAnswer(currentQuestion.id)}
            hasSelection={questionStates[currentQuestion.id]?.hasAnyAnswer ?? false}
            onSubmit={submit}
            isSubmitting={submitting}
          />
        </div>
        <aside className="exam-desktop-sidebar">
          <ExamQuestionNavigator questions={flatQuestions} currentIndex={currentIndex} questionStates={questionStates} onQuestionSelect={handleNavigate} />
        </aside>
      </main>
      <ExamShortcutHelp
        id={shortcutHelpId}
        isOpen={shortcutHelpOpen}
        onClose={() => setShortcutHelpOpen(false)}
        triggerRef={shortcutHelpTriggerRef}
        shortcuts={TIMED_SHORTCUTS}
        description="Bài thi có giới hạn thời gian và sẽ tự động nộp khi hết giờ."
        notes="Dữ liệu được lưu cục bộ trong khi máy chủ chưa truy cập được."
      />
    </div>
  );
}

async function queueStaticFallbackRecovery(
  examId: string,
  startedAtClient: number,
  questions: ReturnType<typeof useSessionV2>['flatQuestions'],
  getMCQAnswer: ReturnType<typeof useSessionV2>['getMCQAnswer'],
  getTFAnswer: ReturnType<typeof useSessionV2>['getTFAnswer'],
  localResult: import('@/types/exam').ExamResultV2,
): Promise<void> {
  try {
    const [meta, dataset] = await Promise.all([
      getExamMeta(examId),
      fetch(EXAM_DATASET_BUILD_URL).then((response) => response.ok ? response.json() as Promise<{ aggregateHash?: string }> : null),
    ]);
    if (!meta?.contentHash || !dataset?.aggregateHash) return;
    const answers: SubmitAnswer[] = questions.map((question) => question.questionType === 'mcq'
      ? { questionInstanceId: question.id, questionType: 'mcq', selected: getMCQAnswer(question.id)?.selected ?? null }
      : { questionInstanceId: question.id, questionType: 'true_false', selected: getTFAnswer(question.id)?.selected ?? { a: null, b: null, c: null, d: null } });
    const request: RecoverExamSubmissionRequest = {
      clientSubmissionId: crypto.randomUUID(), localSessionId: localResult.sessionId, mode: 'TIMED_ORIGINAL',
      datasetVersion: dataset.aggregateHash, examId, examContentHash: meta.contentHash,
      localSubmissionHash: await createLocalSubmissionHash({ examId, answers }),
      clientTiming: { startedAtClient, submittedAtClient: localResult.submittedAt },
      questionRefs: questions.map((question) => ({ questionInstanceId: question.id, publicQuestionId: question.id })), answers,
    };
    enqueueRecovery(request, localResult);
  } catch {
    // The local result remains usable; a missing static descriptor must not erase it.
  }
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
