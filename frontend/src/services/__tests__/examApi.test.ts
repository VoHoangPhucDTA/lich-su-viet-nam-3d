import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

vi.mock('../apiClient', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status = 0) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  apiGet,
  apiPost,
}));

import { ApiRequestError } from '../apiClient';
import {
  isExamApiFallbackError,
  listCatalog,
  listTopicMetadata,
  previewCustomExam,
  resumeExamSession,
  submitExamSession,
} from '../examApi';

describe('examApi catalog contract', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ datasetVersion: 'h1', view: 'VERIFIED', total: 0, items: [] });
    apiPost.mockResolvedValue({});
  });

  it('uses the backend VERIFIED view by default', async () => {
    await listCatalog();

    expect(apiGet).toHaveBeenCalledWith('/api/exams?view=verified', { signal: undefined });
  });

  it('requests REVIEWABLE only for the explicit all-exams view', async () => {
    await listCatalog('reviewable');

    expect(apiGet).toHaveBeenCalledWith('/api/exams?view=reviewable', { signal: undefined });
  });

  it('uses metadata and preview endpoints without loading question refs', async () => {
    const preview = { questionCount: 10 };
    await listTopicMetadata();
    await previewCustomExam(preview);

    expect(apiGet).toHaveBeenCalledWith('/api/exams/topics', { signal: undefined });
    expect(apiPost).toHaveBeenCalledWith('/api/exams/custom/preview', preview, { signal: undefined });
  });

  it('sends the anonymous capability token only when supplied', async () => {
    await resumeExamSession('session-1', { anonymousSessionToken: 'opaque-secret' });
    await resumeExamSession('session-2');

    expect(apiGet).toHaveBeenNthCalledWith(1, '/api/exam-sessions/session-1', {
      signal: undefined,
      headers: { 'X-Exam-Session-Token': 'opaque-secret' },
    });
    expect(apiGet).toHaveBeenNthCalledWith(2, '/api/exam-sessions/session-2', {
      signal: undefined,
      headers: undefined,
    });
  });

  it('forwards the answer array with blank MCQ and partial true/false values', async () => {
    const request = {
      clientSubmissionId: '00000000-0000-4000-8000-000000000001',
      answers: [
        { questionInstanceId: 'q1', questionType: 'mcq' as const, selected: null },
        { questionInstanceId: 'q2', questionType: 'true_false' as const, selected: { a: true, b: null, c: false, d: null } },
      ],
    };

    await submitExamSession('session-1', request);

    expect(apiPost).toHaveBeenCalledWith('/api/exam-sessions/session-1/submit', request, {
      signal: undefined,
      headers: undefined,
    });
  });

  it('falls back only for transport and server-unavailable failures', () => {
    expect(isExamApiFallbackError(new ApiRequestError('NETWORK', 'offline', 0))).toBe(true);
    expect(isExamApiFallbackError(new ApiRequestError('SERVER', 'down', 503))).toBe(true);
    expect(isExamApiFallbackError(new TypeError('fetch failed'))).toBe(true);
    for (const status of [400, 401, 403, 404, 409]) {
      expect(isExamApiFallbackError(new ApiRequestError('BUSINESS_RULE', 'rejected', status))).toBe(false);
    }
  });
});
