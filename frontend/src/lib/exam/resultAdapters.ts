import type { ReviewedQuestion, SafeQuestion } from '@/types/examApi';
import type { ExamAttemptDetailResponse } from '@/services/examAttemptApi';

export interface NormalizedExamResult {
  source: 'snapshot_v2' | 'legacy';
  sessionId: string;
  title: string | null;
  mode: string;
  submittedAt: number | null;
  totalScore: number;
  totalQuestions: number;
  authority: {
    scoreAuthority: string | null;
    timingAuthority: string | null;
    submissionOrigin: string | null;
  };
  questions: NormalizedReviewedQuestion[];
}

export interface NormalizedReviewedQuestion {
  questionInstanceId: string;
  publicQuestionId: string;
  question: SafeQuestion;
  userAnswer: ReviewedQuestion['userAnswer'];
  correctAnswer: ReviewedQuestion['correctAnswer'];
  correctness: boolean;
  points: number;
  completionState: ReviewedQuestion['completionState'];
  explanation: string | null;
  topicRefs: ReviewedQuestion['topicRefs'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeQuestion(value: unknown): value is SafeQuestion {
  if (!isRecord(value) || (value.questionType !== 'mcq' && value.questionType !== 'true_false') || typeof value.questionText !== 'string') return false;
  return value.questionType === 'mcq'
    ? Array.isArray(value.options)
    : Array.isArray(value.statements);
}

/** Validates the persisted server snapshot before any result renderer consumes it. */
export function adaptResultSnapshotV2(value: unknown): NormalizedExamResult | null {
  if (!isRecord(value) || value.snapshotSchemaVersion !== 2 || !isRecord(value.summary) || !Array.isArray(value.questions)) return null;
  if (typeof value.sessionId !== 'string' || typeof value.mode !== 'string' || typeof value.title !== 'string') return null;
  const questions: NormalizedReviewedQuestion[] = [];
  for (const item of value.questions) {
    if (!isRecord(item) || typeof item.questionInstanceId !== 'string' || typeof item.publicQuestionId !== 'string' || !isSafeQuestion(item.question)) return null;
    if (typeof item.correctness !== 'boolean' || typeof item.points !== 'number' || typeof item.completionState !== 'string') return null;
    questions.push({
      questionInstanceId: item.questionInstanceId,
      publicQuestionId: item.publicQuestionId,
      question: item.question,
      userAnswer: item.userAnswer as NormalizedReviewedQuestion['userAnswer'],
      correctAnswer: item.correctAnswer as NormalizedReviewedQuestion['correctAnswer'],
      correctness: item.correctness,
      points: item.points,
      completionState: item.completionState as NormalizedReviewedQuestion['completionState'],
      explanation: typeof item.explanation === 'string' ? item.explanation : null,
      topicRefs: Array.isArray(item.topicRefs) ? item.topicRefs as NormalizedReviewedQuestion['topicRefs'] : [],
    });
  }
  return {
    source: 'snapshot_v2',
    sessionId: value.sessionId,
    title: value.title,
    mode: value.mode,
    submittedAt: typeof value.submittedAtServer === 'number' ? value.submittedAtServer : null,
    totalScore: typeof value.summary.totalScore === 'number' ? value.summary.totalScore : 0,
    totalQuestions: typeof value.summary.totalQuestions === 'number' ? value.summary.totalQuestions : questions.length,
    authority: {
      scoreAuthority: typeof value.scoreAuthority === 'string' ? value.scoreAuthority : null,
      timingAuthority: typeof value.timingAuthority === 'string' ? value.timingAuthority : null,
      submissionOrigin: typeof value.submissionOrigin === 'string' ? value.submissionOrigin : null,
    },
    questions,
  };
}

/** Legacy attempts retain their existing renderer; this adapter never upgrades authority. */
export function adaptLegacyAttempt(value: ExamAttemptDetailResponse): NormalizedExamResult | null {
  if (!value.result || !isRecord(value.result)) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId : null;
  if (!sessionId) return null;
  return {
    source: 'legacy',
    sessionId,
    title: value.title ?? null,
    mode: value.mode,
    submittedAt: typeof value.submittedAt === 'number' ? value.submittedAt : null,
    totalScore: typeof value.totalScore === 'number' ? value.totalScore : Number(value.totalScore) || 0,
    totalQuestions: value.totalQuestions,
    authority: { scoreAuthority: 'FRONTEND_LEGACY', timingAuthority: null, submissionOrigin: null },
    questions: [],
  };
}

export function formatAuthorityLabel(authority: NormalizedExamResult['authority']): string {
  if (authority.scoreAuthority === 'BACKEND' && authority.timingAuthority === 'SERVER' && authority.submissionOrigin === 'SERVER_ON_TIME') return 'Kết quả chính thức đúng hạn';
  if (authority.scoreAuthority === 'BACKEND' && authority.timingAuthority === 'CLIENT_UNVERIFIED' && authority.submissionOrigin === 'SERVER_ISSUED_LATE') return 'Được chấm bởi hệ thống - thời gian nộp chưa được xác minh';
  if (authority.scoreAuthority === 'BACKEND' && authority.timingAuthority === 'CLIENT_UNVERIFIED' && authority.submissionOrigin === 'CLIENT_FALLBACK') return 'Được hệ thống chấm lại từ phiên cục bộ';
  if (authority.scoreAuthority === 'LOCAL_FALLBACK') return 'Kết quả cục bộ - chưa được hệ thống xác minh';
  return 'Kết quả legacy';
}

export function isOfficialTimedResult(authority: NormalizedExamResult['authority']): boolean {
  return authority.scoreAuthority === 'BACKEND'
    && authority.timingAuthority === 'SERVER'
    && authority.submissionOrigin === 'SERVER_ON_TIME';
}
