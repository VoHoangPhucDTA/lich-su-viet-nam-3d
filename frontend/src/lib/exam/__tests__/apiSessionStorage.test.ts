import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearApiSessionLocator,
  makeApiSessionDraft,
  mergeApiSessionDraft,
  readAnonymousSessionToken,
  readApiSessionLocator,
  saveAnonymousSessionToken,
  saveApiSessionLocator,
} from '../apiSessionStorage';
import type { ExamSessionResponse } from '@/types/examApi';

const ROUTE_KEY = 'TIMED_ORIGINAL:exam-1';
const response: ExamSessionResponse = {
  sessionId: 'session-1',
  anonymousSessionToken: null,
  mode: 'TIMED_ORIGINAL',
  title: 'Đề thử',
  datasetVersion: 'h1',
  examContentHash: 'hash',
  scoringVersion: 'v1',
  startedAtServer: 1_000,
  deadlineAt: 61_000,
  status: 'IN_PROGRESS',
  questions: [{
    questionInstanceId: 'q1',
    publicQuestionId: 'public-q1',
    position: 1,
    question: { questionType: 'mcq', questionText: 'Câu hỏi?', difficulty: null, cognitiveLevel: null, options: [{ id: 'A', text: 'A' }] },
    checkedResult: null,
  }],
  practiceSummary: null,
  anonymousResult: null,
};

describe('API session locator ownership', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not reuse an anonymous locator after login', () => {
    saveApiSessionLocator(ROUTE_KEY, 'anonymous-session');

    localStorage.setItem('auth_user', JSON.stringify({ id: 'user-1' }));

    expect(readApiSessionLocator(ROUTE_KEY)).toBeNull();
    saveApiSessionLocator(ROUTE_KEY, 'user-session');
    expect(readApiSessionLocator(ROUTE_KEY)).toBe('user-session');
  });

  it('clears only the current owner locator', () => {
    saveApiSessionLocator(ROUTE_KEY, 'anonymous-session');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'user-1' }));
    saveApiSessionLocator(ROUTE_KEY, 'user-session');

    clearApiSessionLocator(ROUTE_KEY);
    expect(readApiSessionLocator(ROUTE_KEY)).toBeNull();

    localStorage.removeItem('auth_user');
    expect(readApiSessionLocator(ROUTE_KEY)).toBe('anonymous-session');
  });

  it('stores an anonymous token separately from the session draft', () => {
    saveAnonymousSessionToken('session-1', 'opaque-secret');
    const draft = makeApiSessionDraft(response);

    expect(readAnonymousSessionToken('session-1')).toBe('opaque-secret');
    expect(JSON.stringify(draft)).not.toContain('opaque-secret');
  });

  it('keeps local navigation and answers while server resume owns deadline and questions', () => {
    const local = {
      ...makeApiSessionDraft(response),
      currentIndex: 4,
      flags: ['q1'],
      clientSubmissionId: '00000000-0000-4000-8000-000000000001',
      answers: { q1: { questionInstanceId: 'q1', questionType: 'mcq' as const, selected: 'A' as const } },
    };
    const resumed = { ...response, deadlineAt: 31_000, status: 'IN_PROGRESS' as const };

    const merged = mergeApiSessionDraft(resumed, local);

    expect(merged.deadlineAt).toBe(31_000);
    expect(merged.questions).toBe(resumed.questions);
    expect(merged.currentIndex).toBe(0);
    expect(merged.flags).toEqual(['q1']);
    expect(merged.answers.q1.selected).toBe('A');
    expect(merged.clientSubmissionId).toBe(local.clientSubmissionId);
  });
});
