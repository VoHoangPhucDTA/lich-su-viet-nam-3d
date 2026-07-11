/**
 * useSessionV2.ts
 *
 * Hook quản lý toàn bộ vòng đời session thi V2 (mode=thi_thu):
 *  - Load đề từ examLoader (LRU cached)
 *  - Khởi tạo / resume SessionState từ localStorage
 *  - Quản lý answers (MCQ + T/F), flagged, navigation
 *  - Submit → scoreSession → lưu ExamResultV2 vào localStorage
 *
 * Timer KHÔNG quản lý ở đây — để ExamTimer component tự xử lý countdown.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type ExamFile,
  type Question,
  type SessionState,
  type ExamResultV2,
  type MCQAnswer,
  type TFAnswer,
  flattenExamQuestions,
} from '@/types/exam';
import { loadExam } from './examLoader';
import { scoreSession } from './scoring';
import { EXAM_DURATION_SECONDS } from './examConstants';
import { deriveQuestionState, type QuestionDerivedState } from './questionState';

// ── LocalStorage helpers ───────────────────────────────────────────────────────
const lsSessionKey = (examId: string) => `v2_session_${examId}`;
const lsResultKey = (sessionId: string) => `v2_result_${sessionId}`;

function readSessionFromLS(examId: string): SessionState | null {
  try {
    const raw = localStorage.getItem(lsSessionKey(examId));
    return raw ? (JSON.parse(raw) as SessionState) : null;
  } catch {
    return null;
  }
}

function writeSessionToLS(session: SessionState): void {
  if (!session.examId) return;
  localStorage.setItem(lsSessionKey(session.examId), JSON.stringify(session));
}

/** Lưu kết quả thi vào localStorage – gọi từ ngoài hook (ExamV2ResultPage cũng đọc được). */
export function writeResultToLS(result: ExamResultV2): void {
  localStorage.setItem(lsResultKey(result.sessionId), JSON.stringify(result));
}

/** Đọc kết quả thi từ localStorage theo sessionId. */
export function readResultFromLS(sessionId: string): ExamResultV2 | null {
  try {
    const raw = localStorage.getItem(lsResultKey(sessionId));
    return raw ? (JSON.parse(raw) as ExamResultV2) : null;
  } catch {
    return null;
  }
}

function makeSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Public types ───────────────────────────────────────────────────────────────
export interface UseSessionV2Return {
  exam: ExamFile | null;
  session: SessionState | null;
  flatQuestions: Question[];
  currentQuestion: Question | null;
  currentIndex: number;
  loading: boolean;
  error: string | null;
  /** Giây còn lại khi hook lần đầu khởi tạo. Truyền vào ExamTimer làm initialSeconds. */
  initialRemainingSeconds: number;
  questionStates: Record<string, QuestionDerivedState>;
  completedCount: number;
  incompleteCount: number;
  partialCount: number;
  handleMCQSelect: (questionId: string, optionId: 'A' | 'B' | 'C' | 'D') => void;
  handleTFSelect: (questionId: string, stmtId: 'a' | 'b' | 'c' | 'd', value: boolean | null) => void;
  handleClearAnswer: (questionId: string) => void;
  handleToggleFlag: (questionId: string) => void;
  handleNavigate: (index: number) => void;
  handleSubmit: () => ExamResultV2 | null;
  getMCQAnswer: (questionId: string) => MCQAnswer | undefined;
  getTFAnswer: (questionId: string) => TFAnswer | undefined;
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useSessionV2(examId: string | undefined): UseSessionV2Return {
  const [exam, setExam] = useState<ExamFile | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [initialRemainingSeconds, setInitialRemainingSeconds] =
    useState(EXAM_DURATION_SECONDS);
  const submittingRef = useRef(false);

  // ── Load đề + khởi tạo / resume session ────────────────────────────────────
  useEffect(() => {
    if (!examId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    loadExam(examId)
      .then((examFile) => {
        if (cancelled) return;
        setExam(examFile);

        // Resume nếu còn in-progress, bỏ qua nếu đã submitted
        let sess = readSessionFromLS(examId);
        if (sess?.status === 'submitted') sess = null;

        if (!sess) {
          const allQ = flattenExamQuestions(examFile);
          sess = {
            sessionId: makeSessionId(),
            mode: 'thi_thu',
            examId,
            questionsRef: allQ.map((q) => q.id),
            answers: {},
            flagged: [],
            startedAt: Date.now(),
            durationSeconds: EXAM_DURATION_SECONDS,
            status: 'in_progress',
            currentIndex: 0,
          };
          writeSessionToLS(sess);
        }

        setSession(sess);
        setCurrentIndex(sess.currentIndex);

        // Tính giây còn lại từ thời gian đã trôi qua
        const elapsed = Math.floor((Date.now() - sess.startedAt) / 1000);
        setInitialRemainingSeconds(Math.max(0, EXAM_DURATION_SECONDS - elapsed));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Lỗi tải đề thi');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [examId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const flatQuestions: Question[] = exam ? flattenExamQuestions(exam) : [];
  const currentQuestion: Question | null = flatQuestions[currentIndex] ?? null;

  const questionStates: Record<string, QuestionDerivedState> = {};
  if (session) {
    for (const [index, question] of flatQuestions.entries()) {
      questionStates[question.id] = deriveQuestionState(
        question,
        session.answers[question.id],
        session.flagged.includes(question.id),
        index === currentIndex,
      );
    }
  }

  const derivedStates = Object.values(questionStates);
  const completedCount = derivedStates.filter((state) => state.isComplete).length;
  const incompleteCount = flatQuestions.length - completedCount;
  const partialCount = derivedStates.filter(
    (state) => state.hasAnyAnswer && !state.isComplete,
  ).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMCQSelect = useCallback(
    (questionId: string, optionId: 'A' | 'B' | 'C' | 'D') => {
      setSession((prev) => {
        if (!prev) return prev;
        const next: SessionState = {
          ...prev,
          answers: {
            ...prev.answers,
            [questionId]: {
              questionId,
              questionType: 'mcq',
              selected: optionId,
            } as MCQAnswer,
          },
        };
        writeSessionToLS(next);
        return next;
      });
    },
    []
  );

  const handleTFSelect = useCallback(
    (
      questionId: string,
      stmtId: 'a' | 'b' | 'c' | 'd',
      value: boolean | null
    ) => {
      setSession((prev) => {
        if (!prev) return prev;
        const existing = prev.answers[questionId];
        const prevSelected: Record<'a' | 'b' | 'c' | 'd', boolean | null> =
          existing?.questionType === 'true_false'
            ? existing.selected
            : { a: null, b: null, c: null, d: null };
        const next: SessionState = {
          ...prev,
          answers: {
            ...prev.answers,
            [questionId]: {
              questionId,
              questionType: 'true_false',
              selected: { ...prevSelected, [stmtId]: value },
            } as TFAnswer,
          },
        };
        writeSessionToLS(next);
        return next;
      });
    },
    []
  );

  const handleClearAnswer = useCallback((questionId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const nextAnswers: Record<string, MCQAnswer | TFAnswer> = {};
      for (const [k, v] of Object.entries(prev.answers)) {
        if (k !== questionId) nextAnswers[k] = v as MCQAnswer | TFAnswer;
      }
      const next: SessionState = { ...prev, answers: nextAnswers };
      writeSessionToLS(next);
      return next;
    });
  }, []);

  const handleToggleFlag = useCallback((questionId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const isFlagged = prev.flagged.includes(questionId);
      const next: SessionState = {
        ...prev,
        flagged: isFlagged
          ? prev.flagged.filter((id) => id !== questionId)
          : [...prev.flagged, questionId],
      };
      writeSessionToLS(next);
      return next;
    });
  }, []);

  const handleNavigate = useCallback((index: number) => {
    setCurrentIndex(index);
    setSession((prev) => {
      if (!prev) return prev;
      const next: SessionState = { ...prev, currentIndex: index };
      writeSessionToLS(next);
      return next;
    });
  }, []);

  const handleSubmit = useCallback((): ExamResultV2 | null => {
    if (!exam || !session) return null;
    if (submittingRef.current) {
      return readResultFromLS(session.sessionId);
    }
    if (session.status === 'submitted') {
      return readResultFromLS(session.sessionId);
    }

    submittingRef.current = true;
    const finalSession: SessionState = {
      ...session,
      status: 'submitted',
      submittedAt: Date.now(),
    };
    writeSessionToLS(finalSession);
    setSession(finalSession);
    const result = scoreSession(finalSession, exam);
    writeResultToLS(result);
    return result;
  }, [exam, session]);

  const getMCQAnswer = useCallback(
    (questionId: string): MCQAnswer | undefined => {
      const ans = session?.answers[questionId];
      return ans?.questionType === 'mcq' ? (ans as MCQAnswer) : undefined;
    },
    [session]
  );

  const getTFAnswer = useCallback(
    (questionId: string): TFAnswer | undefined => {
      const ans = session?.answers[questionId];
      return ans?.questionType === 'true_false' ? (ans as TFAnswer) : undefined;
    },
    [session]
  );

  return {
    exam,
    session,
    flatQuestions,
    currentQuestion,
    currentIndex,
    loading,
    error,
    initialRemainingSeconds,
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
  };
}
