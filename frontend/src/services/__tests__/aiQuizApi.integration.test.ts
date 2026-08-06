import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../apiClient';
import { generateAiQuiz, getAiQuizErrorMessage } from '../aiQuizApi';
import { clearCsrfToken } from '../csrfClient';

const data = {
  questions: [{
    question: 'Câu hỏi?', options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }, { id: 'C', text: 'C' }, { id: 'D', text: 'D' }],
    correctOptionId: 'A', explanation: 'Giải thích', difficulty: 'MEDIUM', sourceChunkIds: ['s1'],
  }],
  sources: [{ chunkId: 's1', documentId: null, grade: 12, lessonNumber: null, lessonTitle: null, sectionTitle: null, pageStart: null, pageEnd: null, chunkHash: null }],
  warnings: [], generation: { requestedCount: 1, generatedCount: 1, partial: false },
  generationReceipt: { id: 'receipt-1', expiresAt: '2026-07-20T14:00:00' },
};

function jsonResponse(status: number, code: string, responseData: unknown, success = status >= 200 && status < 300) {
  return new Response(JSON.stringify({ success, code, message: success ? 'Success' : 'raw internal message', data: responseData, timestamp: new Date().toISOString() }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function csrfResponse() {
  return jsonResponse(200, 'SUCCESS', { token: 'csrf-token', headerName: 'X-CSRF-TOKEN' });
}

beforeEach(clearCsrfToken);
afterEach(() => vi.unstubAllGlobals());

describe('AI quiz integration against a mocked public Spring endpoint', () => {
  it('uses the public endpoint, JSON body and credentialed shared client', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(jsonResponse(200, 'SUCCESS', data));
    vi.stubGlobal('fetch', fetchMock);
    await generateAiQuiz({ query: 'Chủ đề', grade: 12, difficulty: 'MEDIUM', count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/api\/exams\/ai\/generate$/);
    expect(url).not.toMatch(/:8001|\/ai\/quiz\/generate/);
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({ query: 'Chủ đề', grade: 12, difficulty: 'MEDIUM', count: 1, topK: 5 });
  });

  it('parses a partial Spring response without a second network call', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(jsonResponse(200, 'SUCCESS', { ...data, generation: { requestedCount: 3, generatedCount: 1, partial: true } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await generateAiQuiz({ query: 'Chủ đề', grade: 12, difficulty: 'MEDIUM', count: 3 })).generation.partial).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [409, 'AI_INSUFFICIENT_CONTEXT'],
    [422, 'AI_SERVICE_CONTRACT_REJECTED'],
    [502, 'AI_GENERATION_FAILED'],
    [503, 'AI_SERVICE_UNAVAILABLE'],
    [503, 'AI_SERVICE_DISABLED'],
  ])('normalizes Spring %s / %s without exposing its raw message', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(jsonResponse(status, code, null, false)));
    const error = await generateAiQuiz({ query: 'Chủ đề', grade: 12, difficulty: 'MEDIUM', count: 1 }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe(code);
    expect(getAiQuizErrorMessage(error)).not.toContain('raw internal');
  });

  it('does not refresh or replay a generation request after 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(jsonResponse(401, 'UNAUTHORIZED', null, false));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateAiQuiz({ query: 'Chủ đề', grade: 12, difficulty: 'MEDIUM', count: 1 })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed success data from Spring', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(jsonResponse(200, 'SUCCESS', { questions: [] })));
    await expect(generateAiQuiz({ query: 'Chủ đề', grade: 12, difficulty: 'MEDIUM', count: 1 })).rejects.toMatchObject({ code: 'AI_SERVICE_INVALID_RESPONSE' });
  });

  it('normalizes an aborted wait without claiming upstream cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    const error = await generateAiQuiz({ query: 'Chủ đề', grade: 12, difficulty: 'MEDIUM', count: 1 }).catch((reason: unknown) => reason);
    expect(getAiQuizErrorMessage(error)).toBe('Yêu cầu đã được hủy.');
  });
});
