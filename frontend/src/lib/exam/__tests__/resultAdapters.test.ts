import { describe, expect, it } from 'vitest';
import { adaptLegacyAttempt, adaptResultSnapshotV2, formatAuthorityLabel, isOfficialTimedResult } from '../resultAdapters';

const snapshot = {
  snapshotSchemaVersion: 2, sessionId: 's1', mode: 'TIMED_ORIGINAL', title: 'Đề test', submittedAtServer: 10,
  scoreAuthority: 'BACKEND', timingAuthority: 'SERVER', submissionOrigin: 'SERVER_ON_TIME',
  summary: { totalScore: 1, totalQuestions: 1 },
  questions: [{
    questionInstanceId: 'qi1', publicQuestionId: 'q1', questionType: 'mcq', correctness: true, points: 0.25,
    completionState: 'COMPLETE', userAnswer: 'A', correctAnswer: 'A', explanation: null, topicRefs: [],
    question: { questionType: 'mcq', questionText: 'Câu hỏi?', options: [{ id: 'A', text: 'Đúng' }] },
  }],
};

describe('result snapshot v2 adapter', () => {
  it('accepts a safe reviewed snapshot and retains official authority', () => {
    const result = adaptResultSnapshotV2(snapshot);
    expect(result?.questions).toHaveLength(1);
    expect(result && isOfficialTimedResult(result.authority)).toBe(true);
    expect(result && formatAuthorityLabel(result.authority)).toBe('Kết quả chính thức đúng hạn');
  });

  it('rejects snapshots without a valid reviewed safe question shape', () => {
    expect(adaptResultSnapshotV2({ ...snapshot, questions: [{ ...snapshot.questions[0], question: { questionType: 'mcq' } }] })).toBeNull();
  });

  it('keeps legacy attempts readable without upgrading their authority', () => {
    const result = adaptLegacyAttempt({
      sessionId: 'legacy-1',
      mode: 'TIMED_ORIGINAL',
      title: 'Đề cũ',
      totalQuestions: 28,
      totalScore: '7.5',
      submittedAt: 10,
      result: { legacy: true },
    });

    expect(result).toMatchObject({
      source: 'legacy',
      totalScore: 7.5,
      authority: { scoreAuthority: 'FRONTEND_LEGACY', timingAuthority: null, submissionOrigin: null },
    });
  });

  it('excludes late and fallback attempts from official timed statistics', () => {
    expect(isOfficialTimedResult({ scoreAuthority: 'BACKEND', timingAuthority: 'CLIENT_UNVERIFIED', submissionOrigin: 'SERVER_ISSUED_LATE' })).toBe(false);
    expect(isOfficialTimedResult({ scoreAuthority: 'BACKEND', timingAuthority: 'CLIENT_UNVERIFIED', submissionOrigin: 'CLIENT_FALLBACK' })).toBe(false);
    expect(isOfficialTimedResult({ scoreAuthority: 'LOCAL_FALLBACK', timingAuthority: null, submissionOrigin: 'LOCAL_FALLBACK' })).toBe(false);
    expect(isOfficialTimedResult({ scoreAuthority: 'FRONTEND_LEGACY', timingAuthority: 'SERVER', submissionOrigin: 'SERVER_ON_TIME' })).toBe(false);
  });
});
