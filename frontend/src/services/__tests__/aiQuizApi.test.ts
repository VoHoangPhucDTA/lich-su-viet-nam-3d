import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiPostOnce } = vi.hoisted(() => ({ apiPostOnce: vi.fn() }));

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
  apiPostOnce,
}));

import { ApiRequestError } from '../apiClient';
import { AI_QUIZ_ENDPOINT, generateAiQuiz, getAiQuizErrorMessage, parseAiQuizResponse } from '../aiQuizApi';

const fullResponse = {
  questions: [{
    question: 'Sự kiện nào diễn ra năm 1945?',
    options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: `Lựa chọn ${id}` })),
    correctOptionId: 'A', explanation: 'Dựa trên nội dung bài học.', difficulty: 'MEDIUM', sourceChunkIds: ['chunk-1'],
  }],
  sources: [{ chunkId: 'chunk-1', documentId: 'doc-1', grade: 12, lessonNumber: 6, lessonTitle: 'Cách mạng tháng Tám', sectionTitle: null, pageStart: 35, pageEnd: null, chunkHash: null }],
  warnings: [],
  generation: { requestedCount: 1, generatedCount: 1, partial: false },
  generationReceipt: { id: 'receipt-1', expiresAt: '2026-07-20T14:00:00' },
};

describe('aiQuizApi public Spring contract', () => {
  beforeEach(() => {
    apiPostOnce.mockReset();
    apiPostOnce.mockResolvedValue(fullResponse);
  });

  it('posts once to Spring with credentials handled by the shared client and no internal fields', async () => {
    const signal = new AbortController().signal;
    await generateAiQuiz({ query: '  Cách mạng tháng Tám  ', grade: 12, lessonNumber: 6, difficulty: 'MEDIUM', count: 1 }, signal);
    expect(apiPostOnce).toHaveBeenCalledWith(AI_QUIZ_ENDPOINT, {
      query: 'Cách mạng tháng Tám', grade: 12, lessonNumber: 6, difficulty: 'MEDIUM', count: 1, topK: 5,
    }, { signal });
    const body = apiPostOnce.mock.calls[0]?.[1];
    expect(body).not.toHaveProperty('styleExamples');
    expect(body).not.toHaveProperty('factContext');
    expect(body).not.toHaveProperty('sourceChunkIds');
    expect(body).not.toHaveProperty('generationModel');
    expect(JSON.stringify(body)).not.toMatch(/api.?key/i);
  });

  it('parses a valid partial response without retrying', () => {
    const parsed = parseAiQuizResponse({ ...fullResponse, generation: { requestedCount: 5, generatedCount: 1, partial: true } });
    expect(parsed.generation).toEqual({ requestedCount: 5, generatedCount: 1, partial: true });
  });

  it('accepts nullable source pages', () => {
    expect(parseAiQuizResponse(fullResponse).sources[0]?.pageEnd).toBeNull();
  });

  it.each([
    { name: 'three options', mutate: { ...fullResponse, questions: [{ ...fullResponse.questions[0], options: fullResponse.questions[0].options.slice(0, 3) }] } },
    { name: 'unknown correct id', mutate: { ...fullResponse, questions: [{ ...fullResponse.questions[0], correctOptionId: 'E' }] } },
    { name: 'missing source mapping', mutate: { ...fullResponse, sources: [] } },
    { name: 'inconsistent count', mutate: { ...fullResponse, generation: { requestedCount: 2, generatedCount: 2, partial: false } } },
  ])('rejects malformed response: $name', ({ mutate }) => {
    expect(() => parseAiQuizResponse(mutate)).toThrowError(expect.objectContaining({ code: 'AI_SERVICE_INVALID_RESPONSE' }));
  });

  it('maps public error codes without exposing raw internal messages', () => {
    expect(getAiQuizErrorMessage(new ApiRequestError('AI_SERVICE_TIMEOUT', '127.0.0.1:8001 failed', 504))).toContain('mất nhiều thời gian');
    expect(getAiQuizErrorMessage(new ApiRequestError('AI_SERVICE_DISABLED', 'internal', 503))).not.toContain('internal');
    expect(getAiQuizErrorMessage(new ApiRequestError('UNKNOWN', 'stack trace', 500))).not.toContain('stack trace');
    expect(getAiQuizErrorMessage(new ApiRequestError('AUTH', 'raw', 401))).toContain('đăng nhập');
  });
});
