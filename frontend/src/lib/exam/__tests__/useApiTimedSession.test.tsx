import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApiTimedSession } from '@/lib/exam/useApiTimedSession';

const mocks = vi.hoisted(() => ({
  createExamSession: vi.fn(() => new Promise(() => undefined)),
}));

vi.mock('@/services/examApi', () => ({
  createExamSession: mocks.createExamSession,
  getExamApiErrorCode: vi.fn(() => null),
  isExamApiFallbackError: vi.fn(() => false),
  resumeExamSession: vi.fn(),
  submitExamSession: vi.fn(),
}));

vi.mock('@/lib/exam/apiSessionStorage', () => ({
  mergeApiSessionDraft: vi.fn(),
  clearApiSessionLocator: vi.fn(),
  readAnonymousSessionToken: vi.fn(() => null),
  readApiSessionDraft: vi.fn(() => null),
  readApiSessionLocator: vi.fn(() => null),
  saveAnonymousSessionToken: vi.fn(),
  saveApiSessionDraft: vi.fn(),
  saveApiSessionLocator: vi.fn(),
}));

vi.mock('@/lib/exam/examRecoveryQueue', () => ({
  createLocalSubmissionHash: vi.fn(),
  enqueueRecovery: vi.fn(),
}));

function SessionHarness() {
  useApiTimedSession({
    routeKey: 'TIMED_ORIGINAL:exam-strict-mode',
    request: { mode: 'TIMED_ORIGINAL', examId: 'exam-strict-mode' },
  });
  return null;
}

describe('useApiTimedSession', () => {
  it('reuses the in-flight session request when StrictMode reruns the effect', async () => {
    render(
      <StrictMode>
        <SessionHarness />
      </StrictMode>,
    );

    await waitFor(() => expect(mocks.createExamSession).toHaveBeenCalledTimes(1));
  });
});
