import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recover, isFallback } = vi.hoisted(() => ({ recover: vi.fn(), isFallback: vi.fn() }));
vi.mock('@/services/examApi', () => ({
  recoverExamSubmission: recover,
  getExamApiErrorCode: (error: unknown) => error instanceof Error ? error.message : null,
  isExamApiFallbackError: isFallback,
}));

import { enqueueRecovery, flushRecoveryQueue, pendingRecoveryCount } from '../examRecoveryQueue';

const request = {
  clientSubmissionId: '00000000-0000-4000-8000-000000000001',
  localSessionId: 'local-session', mode: 'TIMED_ORIGINAL' as const, datasetVersion: 'h1', examId: 'exam-1', examContentHash: 'hash',
  clientTiming: { startedAtClient: 1, submittedAtClient: 2 }, questionRefs: [{ questionInstanceId: 'q1', publicQuestionId: 'q1' }],
  answers: [{ questionInstanceId: 'q1', questionType: 'mcq' as const, selected: null }],
};

describe('exam recovery queue', () => {
  beforeEach(() => { localStorage.clear(); recover.mockReset(); isFallback.mockReset(); });

  it('does not attach anonymous fallback work after a later login', () => {
    expect(enqueueRecovery(request)).toBe(false);
    expect(localStorage.getItem('exam_submission_recovery_queue_v1')).toBeNull();
  });

  it('keeps a backend-scored record and does not resubmit it', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', fullName: 'U', email: 'u@example.test', role: 'USER' }));
    recover.mockResolvedValue({ sessionId: 's1' });
    expect(enqueueRecovery(request, { scoreAuthority: 'LOCAL_FALLBACK' })).toBe(true);
    await expect(flushRecoveryQueue()).resolves.toEqual({ recovered: 1, pending: 0 });
    expect(pendingRecoveryCount()).toBe(0);
    const saved = JSON.parse(localStorage.getItem('exam_submission_recovery_queue_v1') ?? '[]');
    expect(saved[0].syncStatus).toBe('BACKEND_SCORED');
    await flushRecoveryQueue();
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('retains a version mismatch and its local result without retrying it', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', fullName: 'U', email: 'u@example.test', role: 'USER' }));
    recover.mockRejectedValue(new Error('VERSION_MISMATCH'));
    enqueueRecovery(request, { scoreAuthority: 'LOCAL_FALLBACK', totalScore: 4 });
    await expect(flushRecoveryQueue()).resolves.toEqual({ recovered: 0, pending: 0 });
    const saved = JSON.parse(localStorage.getItem('exam_submission_recovery_queue_v1') ?? '[]');
    expect(saved[0]).toMatchObject({ syncStatus: 'VERSION_MISMATCH', lastErrorCode: 'VERSION_MISMATCH', localResult: { totalScore: 4 } });
    await flushRecoveryQueue();
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('keeps a transport failure retryable with raw local work intact', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', fullName: 'U', email: 'u@example.test', role: 'USER' }));
    recover.mockRejectedValue(new TypeError('offline'));
    isFallback.mockReturnValue(true);
    enqueueRecovery(request, { scoreAuthority: 'LOCAL_FALLBACK' });
    await expect(flushRecoveryQueue()).resolves.toEqual({ recovered: 0, pending: 1 });
    const saved = JSON.parse(localStorage.getItem('exam_submission_recovery_queue_v1') ?? '[]');
    expect(saved[0]).toMatchObject({ syncStatus: 'FAILED_RETRYABLE', retryCount: 1, localResult: { scoreAuthority: 'LOCAL_FALLBACK' } });
    await flushRecoveryQueue();
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('shares one active flush instead of syncing the same item concurrently', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', fullName: 'U', email: 'u@example.test', role: 'USER' }));
    let release: (() => void) | undefined;
    recover.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ sessionId: 's1' });
    }));
    enqueueRecovery(request);

    const first = flushRecoveryQueue();
    const second = flushRecoveryQueue();
    expect(recover).toHaveBeenCalledTimes(1);
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { recovered: 1, pending: 0 },
      { recovered: 1, pending: 0 },
    ]);
  });

  it('preserves local work permanently when the authenticated owner mismatches', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', fullName: 'U', email: 'u@example.test', role: 'USER' }));
    recover.mockRejectedValue(new Error('AUTH_MISMATCH'));
    enqueueRecovery(request, { scoreAuthority: 'LOCAL_FALLBACK', totalScore: 5 });

    await expect(flushRecoveryQueue()).resolves.toEqual({ recovered: 0, pending: 0 });
    const saved = JSON.parse(localStorage.getItem('exam_submission_recovery_queue_v1') ?? '[]');
    expect(saved[0]).toMatchObject({
      syncStatus: 'AUTH_MISMATCH',
      lastErrorCode: 'AUTH_MISMATCH',
      localResult: { scoreAuthority: 'LOCAL_FALLBACK', totalScore: 5 },
    });
    await flushRecoveryQueue();
    expect(recover).toHaveBeenCalledTimes(1);
  });
});
