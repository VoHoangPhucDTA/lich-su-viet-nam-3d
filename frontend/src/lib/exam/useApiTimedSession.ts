import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createExamSession,
  getExamApiErrorCode,
  isExamApiFallbackError,
  resumeExamSession,
  submitExamSession,
} from '@/services/examApi';
import { createLocalSubmissionHash, enqueueRecovery } from './examRecoveryQueue';
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
import type { ExamSessionResponse, ExamSessionSubmitResponse, RecoverExamSubmissionRequest, SafeQuestionType, SubmittedSelection, SubmitAnswer } from '@/types/examApi';

const RESULT_PREFIX = 'exam_api_result_';

function createClientSubmissionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function sessionOptions(sessionId: string) {
  return { anonymousSessionToken: readAnonymousSessionToken(sessionId) };
}

function writeApiResult(result: ExamSessionSubmitResponse): void {
  localStorage.setItem(`${RESULT_PREFIX}${result.sessionId}`, JSON.stringify(result.result));
}

function makeSubmitAnswer(questionInstanceId: string, questionType: SafeQuestionType, selected: SubmittedSelection): SubmitAnswer {
  if (questionType === 'mcq') {
    if (selected !== null && typeof selected !== 'string') throw new Error('MCQ answer must be an option ID or null');
    return { questionInstanceId, questionType, selected };
  }
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) throw new Error('True/false answer must contain statement choices');
  return { questionInstanceId, questionType, selected };
}

export function readApiResult(sessionId: string): unknown | null {
  try {
    const raw = localStorage.getItem(`${RESULT_PREFIX}${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export interface ApiTimedQuestion {
  id: string;
  publicQuestionId: string;
  question: ExamSessionResponse['questions'][number]['question'];
}

export interface ApiTimedQuestionState {
  hasAnyAnswer: boolean;
  isComplete: boolean;
  isFlagged: boolean;
  isCurrent: boolean;
  answeredUnitCount: number;
  totalUnitCount: number;
}

export interface ApiTimedSessionOptions {
  routeKey: string;
  request: { mode: 'TIMED_ORIGINAL' | 'CUSTOM_MOCK'; examId?: string; expectedDatasetVersion?: string } | null;
  initialSessionId?: string;
}

export function useApiTimedSession({ routeKey, request, initialSessionId }: ApiTimedSessionOptions) {
  const [serverSession, setServerSession] = useState<ExamSessionResponse | null>(null);
  const [draft, setDraft] = useState<ApiSessionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackEligible, setFallbackEligible] = useState(false);
  const submittingRef = useRef(false);
  const loadRef = useRef<{ key: string; promise: Promise<ExamSessionResponse> } | null>(null);

  useEffect(() => {
    if (!request && !initialSessionId) {
      setLoading(false);
      setError('Liên kết đề thi không hợp lệ.');
      return;
    }
    const createRequest = request;
    const priorSessionId = initialSessionId ?? readApiSessionLocator(routeKey);
    const loadKey = priorSessionId ? `resume:${priorSessionId}` : `create:${routeKey}`;
    if (!loadRef.current || loadRef.current.key !== loadKey) {
      loadRef.current = {
        key: loadKey,
        promise: priorSessionId
          ? resumeExamSession(priorSessionId, sessionOptions(priorSessionId))
          : createExamSession(createRequest!),
      };
    }
    const loadPromise = loadRef.current.promise;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFallbackEligible(false);

    async function load(): Promise<void> {
      try {
        const response = await loadPromise;
        if (cancelled) return;
        if (response.anonymousSessionToken) saveAnonymousSessionToken(response.sessionId, response.anonymousSessionToken);
        saveApiSessionLocator(routeKey, response.sessionId);
        const local = readApiSessionDraft(response.sessionId);
        const merged = mergeApiSessionDraft(response, local);
        saveApiSessionDraft(merged);
        setServerSession(response);
        setDraft(merged);
      } catch (loadError: unknown) {
        if (cancelled) return;
        setFallbackEligible(isExamApiFallbackError(loadError));
        setError(loadError instanceof Error ? loadError.message : 'Không thể tạo phiên thi từ máy chủ.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialSessionId, request, routeKey]);

  const questions = useMemo<ApiTimedQuestion[]>(() => (serverSession?.questions ?? []).map((item) => ({
    id: item.questionInstanceId,
    publicQuestionId: item.publicQuestionId,
    question: item.question,
  })), [serverSession]);

  const currentIndex = draft?.currentIndex ?? 0;
  const currentQuestion = questions[currentIndex] ?? null;
  const answers = useMemo(() => draft?.answers ?? {}, [draft]);
  const flags = useMemo(() => draft?.flags ?? [], [draft]);

  const questionStates = useMemo<Record<string, ApiTimedQuestionState>>(() => {
    const result: Record<string, ApiTimedQuestionState> = {};
    for (const [index, item] of questions.entries()) {
      const answer = answers[item.id];
      const selected = answer?.selected;
      const totalUnitCount = item.question.questionType === 'mcq' ? 1 : 4;
      const answeredUnitCount = item.question.questionType === 'mcq'
        ? (selected ? 1 : 0)
        : (selected && typeof selected === 'object' ? Object.values(selected).filter((value) => value !== null).length : 0);
      result[item.id] = {
        hasAnyAnswer: answeredUnitCount > 0,
        isComplete: answeredUnitCount === totalUnitCount,
        isFlagged: flags.includes(item.id),
        isCurrent: index === currentIndex,
        answeredUnitCount,
        totalUnitCount,
      };
    }
    return result;
  }, [answers, currentIndex, flags, questions]);

  const updateDraft = useCallback((updater: (previous: ApiSessionDraft) => ApiSessionDraft) => {
    setDraft((previous) => {
      if (!previous) return previous;
      const next = { ...updater(previous), updatedAt: Date.now() };
      saveApiSessionDraft(next);
      return next;
    });
  }, []);

  const setAnswer = useCallback((questionId: string, questionType: SafeQuestionType, selected: SubmittedSelection) => {
    updateDraft((previous) => ({
      ...previous,
      answers: { ...previous.answers, [questionId]: makeSubmitAnswer(questionId, questionType, selected) },
    }));
  }, [updateDraft]);

  const clearAnswer = useCallback((questionId: string) => {
    updateDraft((previous) => {
      const answers = { ...previous.answers };
      delete answers[questionId];
      return { ...previous, answers };
    });
  }, [updateDraft]);

  const navigate = useCallback((index: number) => {
    updateDraft((previous) => ({ ...previous, currentIndex: Math.max(0, Math.min(index, Math.max(previous.questions.length - 1, 0))) }));
  }, [updateDraft]);

  const toggleFlag = useCallback((questionId: string) => {
    updateDraft((previous) => ({
      ...previous,
      flags: previous.flags.includes(questionId) ? previous.flags.filter((id) => id !== questionId) : [...previous.flags, questionId],
    }));
  }, [updateDraft]);

  const submit = useCallback(async (): Promise<ExamSessionSubmitResponse | null> => {
    if (!serverSession || !draft) return null;
    if (submittingRef.current) return null;
    submittingRef.current = true;
    try {
      const clientSubmissionId = draft.clientSubmissionId ?? createClientSubmissionId();
      if (!draft.clientSubmissionId) updateDraft((previous) => ({ ...previous, clientSubmissionId }));
      const payloadAnswers = questions.map((question): SubmitAnswer => draft.answers[question.id] ?? makeSubmitAnswer(
        question.id,
        question.question.questionType,
        question.question.questionType === 'mcq' ? null : { a: null, b: null, c: null, d: null },
      ));
      const request = { clientSubmissionId, answers: payloadAnswers };
      let result: ExamSessionSubmitResponse;
      try {
        result = await submitExamSession(serverSession.sessionId, request, sessionOptions(serverSession.sessionId));
      } catch (submitError: unknown) {
        const code = getExamApiErrorCode(submitError);
        const shouldQueue = isExamApiFallbackError(submitError) || code === 'SUBMISSION_AFTER_GRACE';
        if (shouldQueue && (serverSession.mode === 'TIMED_ORIGINAL' || serverSession.mode === 'CUSTOM_MOCK')) {
          const recovery: RecoverExamSubmissionRequest = {
            clientSubmissionId,
            serverSessionId: serverSession.sessionId,
            mode: serverSession.mode,
            datasetVersion: serverSession.datasetVersion,
            examContentHash: serverSession.examContentHash,
            localSubmissionHash: await createLocalSubmissionHash({ sessionId: serverSession.sessionId, answers: payloadAnswers }),
            clientTiming: { startedAtClient: draft.startedAtServer, submittedAtClient: Date.now() },
            questionRefs: questions.map((question) => ({ questionInstanceId: question.id, publicQuestionId: question.publicQuestionId })),
            answers: payloadAnswers,
          };
          if (enqueueRecovery(recovery)) {
            throw new Error('Bài làm đã được giữ trong hàng đợi khôi phục và sẽ được hệ thống chấm lại khi kết nối ổn định.');
          }
        }
        throw submitError;
      }
      writeApiResult(result);
      updateDraft((previous) => ({ ...previous, status: 'SUBMITTED' }));
      clearApiSessionLocator(routeKey);
      return result;
    } finally {
      submittingRef.current = false;
    }
  }, [draft, questions, routeKey, serverSession, updateDraft]);

  const completedCount = Object.values(questionStates).filter((state) => state.isComplete).length;
  const partialCount = Object.values(questionStates).filter((state) => state.hasAnyAnswer && !state.isComplete).length;

  return {
    serverSession,
    draft,
    questions,
    currentQuestion,
    currentIndex,
    answers,
    questionStates,
    completedCount,
    partialCount,
    incompleteCount: questions.length - completedCount,
    loading,
    error,
    fallbackEligible,
    setAnswer,
    clearAnswer,
    navigate,
    toggleFlag,
    submit,
  };
}
