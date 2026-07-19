import { describe, expect, it } from 'vitest';
import { resultSummaryFromAttempt } from '@/lib/exam/examAttemptSync';

describe('resultSummaryFromAttempt', () => {
  it('keeps section scores returned by backend history', () => {
    const result = resultSummaryFromAttempt({
      sessionId: 'sess_history_scores',
      mode: 'TIMED_ORIGINAL',
      examId: 'exam-1',
      title: 'Đề kiểm tra',
      isCustom: false,
      totalQuestions: 28,
      totalScore: '7.25',
      mcqScore: '4.50',
      tfScore: 2.75,
      durationSeconds: 1800,
      submittedAt: 1_700_000_000_000,
    });

    expect(result.totalScore).toBe(7.25);
    expect(result.mcqScore).toBe(4.5);
    expect(result.tfScore).toBe(2.75);
  });
});
