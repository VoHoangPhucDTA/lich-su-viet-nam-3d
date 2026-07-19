import { loadStoredUser } from '@/services/apiClient';
import {
  getExamAttemptDetail,
  listExamAttempts,
  type ExamAttemptDetailResponse,
  type ExamAttemptListResponse,
  type ExamAttemptSummaryResponse,
} from '@/services/examAttemptApi';
import type { ExamResultV2 } from '@/types/exam';

function numberValue(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  return numberValue(value, 0);
}

function hasStoredUser(): boolean {
  return loadStoredUser() !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function fetchBackendAttemptHistory(limit?: number): Promise<ExamAttemptListResponse | null> {
  if (!hasStoredUser()) return null;
  return listExamAttempts(limit);
}

export async function fetchBackendAttemptDetail(sessionId: string): Promise<ExamAttemptDetailResponse | null> {
  if (!hasStoredUser()) return null;
  return getExamAttemptDetail(sessionId);
}

export function resultFromAttemptDetail(detail: ExamAttemptDetailResponse): ExamResultV2 | null {
  if (!isPlainObject(detail.result)) return null;
  const storedResult = detail.result as unknown as ExamResultV2;
  return {
    ...storedResult,
    sessionId: detail.sessionId,
    mode: detail.mode as ExamResultV2['mode'],
    examId: detail.examId ?? undefined,
    title: detail.title ?? undefined,
    isCustom: Boolean(detail.isCustom),
    sourceExamIds: Array.isArray(detail.sourceExamIds) ? detail.sourceExamIds as string[] : undefined,
    questionSnapshots: Array.isArray(detail.questionSnapshots)
      ? detail.questionSnapshots as ExamResultV2['questionSnapshots']
      : storedResult.questionSnapshots,
    answers: isPlainObject(detail.answers) ? detail.answers as unknown as ExamResultV2['answers'] : storedResult.answers,
    config: isPlainObject(detail.config) ? detail.config as unknown as ExamResultV2['config'] : storedResult.config,
    totalQuestions: detail.totalQuestions,
    totalScore: numberValue(detail.totalScore),
    mcqScore: nullableNumber(detail.mcqScore) ?? numberValue(storedResult.mcqScore),
    tfScore: nullableNumber(detail.tfScore) ?? numberValue(storedResult.tfScore),
    durationSeconds: detail.durationSeconds ?? numberValue(storedResult.durationSeconds),
    submittedAt: detail.submittedAt,
  };
}

export function resultSummaryFromAttempt(summary: ExamAttemptSummaryResponse): ExamResultV2 {
  const totalScore = numberValue(summary.totalScore);
  return {
    sessionId: summary.sessionId,
    examId: summary.examId ?? undefined,
    mode: summary.mode as ExamResultV2['mode'],
    title: summary.title ?? undefined,
    isCustom: Boolean(summary.isCustom),
    totalScore,
    mcqScore: 0,
    tfScore: 0,
    totalQuestions: summary.totalQuestions,
    correctMCQ: 0,
    wrongMCQ: 0,
    blankMCQ: 0,
    tfBreakdown: [0, 0, 0, 0, 0],
    durationSeconds: summary.durationSeconds ?? 0,
    submittedAt: summary.submittedAt,
    scoreAuthority: summary.scoreAuthority,
    timingAuthority: summary.timingAuthority,
    submissionOrigin: summary.submissionOrigin,
    questions: [],
  };
}
