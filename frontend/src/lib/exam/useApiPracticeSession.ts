import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkExamQuestion,
  completeExamPractice,
  getExamApiErrorCode,
  isExamApiFallbackError,
  createExamSession,
  resumeExamSession,
} from '@/services/examApi';
import {
  mergeApiSessionDraft,
  clearApiSessionLocator,
  readAnonymousSessionToken,
  readApiSessionDraft,
  readApiSessionLocator,
  saveAnonymousSessionToken,
  saveApiSessionDraft,
  saveApiSessionLocator,
  type ApiSessionDraft,
} from './apiSessionStorage';
import type { CheckedQuestionResult, CreateExamSessionRequest, ExamSessionResponse, SafeQuestionType, SubmittedSelection } from '@/types/examApi';

function optionsFor(sessionId: string) {
  return { anonymousSessionToken: readAnonymousSessionToken(sessionId) };
}

function isCompleteAnswer(questionType: SafeQuestionType, selected: SubmittedSelection | undefined): boolean {
  if (questionType === 'mcq') return typeof selected === 'string';
  return Boolean(selected && typeof selected === 'object' && !Array.isArray(selected)
    && Object.values(selected).every((value) => value !== null));
}

export function getPracticeSessionLoadErrorMessage(error: unknown): string {
  if (getExamApiErrorCode(error) === 'RETRY_SOURCE_UNSUPPORTED') {
    return 'Bài làm cũ không có đủ dữ liệu câu hỏi bất biến để ôn lại an toàn. Hệ thống sẽ không dùng đáp án của đề hiện tại thay cho phiên bản đã làm.';
  }
  return error instanceof Error ? error.message : 'Không thể tạo phiên luyện tập từ máy chủ.';
}

export function useApiPracticeSession(routeKey: string, request: CreateExamSessionRequest | null, initialSessionId?: string) {
  const [serverSession, setServerSession] = useState<ExamSessionResponse | null>(null);
  const [draft, setDraft] = useState<ApiSessionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackEligible, setFallbackEligible] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [practiceSummary, setPracticeSummary] = useState<ExamSessionResponse['practiceSummary']>(null);

  useEffect(() => {
    if (!request && !initialSessionId) {
      setLoading(false);
      setError('Liên kết luyện tập không hợp lệ.');
      return;
    }
    const controller = new AbortController();
    const createRequest = request;
    setLoading(true);
    setError(null);
    setFallbackEligible(false);

    async function load(): Promise<void> {
      try {
        const priorSessionId = initialSessionId ?? readApiSessionLocator(routeKey);
        let response: ExamSessionResponse;
        if (priorSessionId) {
          response = await resumeExamSession(priorSessionId, { ...optionsFor(priorSessionId), signal: controller.signal });
        } else if (createRequest) {
          response = await createExamSession(createRequest, controller.signal);
        } else {
          throw new Error('Liên kết luyện tập không hợp lệ.');
        }
        if (controller.signal.aborted) return;
        if (response.anonymousSessionToken) saveAnonymousSessionToken(response.sessionId, response.anonymousSessionToken);
        saveApiSessionLocator(routeKey, response.sessionId);
        const next = mergeApiSessionDraft(response, readApiSessionDraft(response.sessionId));
        saveApiSessionDraft(next);
        setServerSession(response);
        setDraft(next);
        setPracticeSummary(response.practiceSummary);
      } catch (loadError: unknown) {
        if (controller.signal.aborted) return;
        setFallbackEligible(isExamApiFallbackError(loadError));
        setError(getPracticeSessionLoadErrorMessage(loadError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [initialSessionId, request, routeKey]);

  const questions = useMemo(() => serverSession?.questions ?? [], [serverSession]);
  const currentIndex = draft?.currentIndex ?? 0;
  const currentQuestion = questions[currentIndex] ?? null;
  const answers = useMemo(() => draft?.answers ?? {}, [draft]);

  const updateDraft = useCallback((updater: (previous: ApiSessionDraft) => ApiSessionDraft) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const next = { ...updater(previous), updatedAt: Date.now() };
      saveApiSessionDraft(next);
      return next;
    });
  }, []);

  const setAnswer = useCallback((questionId: string, questionType: SafeQuestionType, selected: SubmittedSelection) => {
    const checked = serverSession?.questions.find((question) => question.questionInstanceId === questionId)?.checkedResult;
    if (checked) return;
    updateDraft((previous) => ({
      ...previous,
      answers: {
        ...previous.answers,
        [questionId]: questionType === 'mcq'
          ? { questionInstanceId: questionId, questionType, selected: selected as 'A' | 'B' | 'C' | 'D' | null }
          : { questionInstanceId: questionId, questionType, selected: selected as Record<'a' | 'b' | 'c' | 'd', boolean | null> },
      },
    }));
  }, [serverSession?.questions, updateDraft]);

  const navigate = useCallback((index: number) => {
    updateDraft((previous) => ({ ...previous, currentIndex: Math.max(0, Math.min(index, Math.max(previous.questions.length - 1, 0))) }));
  }, [updateDraft]);

  const checkCurrent = useCallback(async (): Promise<CheckedQuestionResult | null> => {
    if (!serverSession || !currentQuestion || checkingId || currentQuestion.checkedResult) return currentQuestion?.checkedResult ?? null;
    const answer = answers[currentQuestion.questionInstanceId];
    if (!answer || !isCompleteAnswer(currentQuestion.question.questionType, answer.selected)) {
      setError(currentQuestion.question.questionType === 'mcq' ? 'Hãy chọn một đáp án trước khi kiểm tra.' : 'Hãy chọn Đúng/Sai cho đủ bốn ý trước khi kiểm tra.');
      return null;
    }
    setCheckingId(currentQuestion.questionInstanceId);
    setError(null);
    try {
      const checked = await checkExamQuestion(
        serverSession.sessionId,
        currentQuestion.questionInstanceId,
        answer.questionType,
        answer.selected,
        optionsFor(serverSession.sessionId),
      );
      setServerSession((previous) => previous && {
        ...previous,
        questions: previous.questions.map((question) => question.questionInstanceId === currentQuestion.questionInstanceId
          ? { ...question, checkedResult: checked }
          : question),
      });
      const willComplete = serverSession.questions.filter((question) => question.checkedResult !== null).length + 1
        === serverSession.questions.length;
      if (willComplete) {
        const completed = await resumeExamSession(serverSession.sessionId, optionsFor(serverSession.sessionId));
        setServerSession(completed);
        setPracticeSummary(completed.practiceSummary);
        updateDraft((previous) => ({ ...previous, status: completed.status }));
        clearApiSessionLocator(routeKey);
      }
      return checked;
    } finally {
      setCheckingId(null);
    }
  }, [answers, checkingId, currentQuestion, routeKey, serverSession, updateDraft]);

  const complete = useCallback(async (): Promise<ExamSessionResponse['practiceSummary'] | null> => {
    if (!serverSession) return null;
    const summary = await completeExamPractice(serverSession.sessionId, optionsFor(serverSession.sessionId));
    setPracticeSummary(summary);
    setServerSession((previous) => previous ? { ...previous, status: 'COMPLETED', practiceSummary: summary } : previous);
    updateDraft((previous) => ({ ...previous, status: 'COMPLETED' }));
    clearApiSessionLocator(routeKey);
    return summary;
  }, [routeKey, serverSession, updateDraft]);

  const checkedCount = useMemo(() => questions.filter((question) => question.checkedResult !== null).length, [questions]);
  const correctCount = useMemo(() => questions.filter((question) => question.checkedResult?.correct).length, [questions]);
  const isComplete = serverSession?.status === 'COMPLETED';

  return {
    serverSession,
    draft,
    questions,
    currentQuestion,
    currentIndex,
    answers,
    loading,
    error,
    fallbackEligible,
    checkingId,
    practiceSummary,
    checkedCount,
    correctCount,
    isComplete,
    setAnswer,
    navigate,
    checkCurrent,
    complete,
  };
}
