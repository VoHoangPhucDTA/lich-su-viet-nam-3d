import type { ExamFile } from '@/types/exam';
import { EXAM_DURATION_SECONDS } from './examConstants';

/** Uses the source exam duration when it is valid, with the THPT default as fallback. */
export function getExamDurationSeconds(
  exam: Pick<ExamFile, 'timeLimitMinutes'> | null | undefined,
): number {
  return normalizeSessionDurationSeconds(undefined, exam?.timeLimitMinutes);
}

/** Keeps a valid saved duration and otherwise resolves the current exam duration. */
export function normalizeSessionDurationSeconds(
  storedDuration: unknown,
  examTimeLimitMinutes: unknown,
): number {
  if (
    typeof storedDuration === 'number' &&
    Number.isFinite(storedDuration) &&
    storedDuration > 0
  ) {
    return storedDuration;
  }

  const minutes = examTimeLimitMinutes;
  if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
    return Math.round(minutes * 60);
  }

  return EXAM_DURATION_SECONDS;
}

export function getExamDeadlineMs(startedAt: number, durationSeconds: number): number {
  return startedAt + durationSeconds * 1000;
}

export function getRemainingExamSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
