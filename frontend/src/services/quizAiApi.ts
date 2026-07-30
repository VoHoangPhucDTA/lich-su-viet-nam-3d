import { ApiRequestError, apiPostOnce } from './apiClient';
import type { AiGeneratedQuestion, AiQuizDifficulty, AiQuizSource } from '../types/aiQuiz';

export const QUIZ_GENERATE_ENDPOINT = '/api/quiz/generate';
export const QUIZ_QUERY_MAX_LENGTH = 1000;
export const QUIZ_COUNT_MIN = 1;
export const QUIZ_COUNT_MAX = 10;

export interface PracticeQuizRequest {
  query: string;
  difficulty: AiQuizDifficulty;
  count: number;
}

export interface PracticeQuizResponse {
  questions: AiGeneratedQuestion[];
  sources: AiQuizSource[];
  warnings: string[];
  generation: { requestedCount: number; generatedCount: number; partial: boolean };
}

export const QUIZ_AI_ERROR_MESSAGES: Record<string, string> = {
  AI_INSUFFICIENT_CONTEXT: 'Chưa tìm thấy đủ nội dung phù hợp để tạo câu hỏi. Hãy mô tả chủ đề cụ thể hơn.',
  AI_SERVICE_TIMEOUT: 'Quá trình tạo câu hỏi mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.',
  AI_SERVICE_UNAVAILABLE: 'Tính năng tạo câu hỏi đang tạm thời không khả dụng.',
  AI_STYLE_EXAMPLES_UNAVAILABLE: 'Tính năng tạo câu hỏi đang tạm thời không khả dụng.',
  AI_GENERATION_FAILED: 'Hệ thống chưa thể tạo bộ câu hỏi hợp lệ từ nội dung đã tìm thấy.',
  AI_SERVICE_INVALID_RESPONSE: 'Hệ thống nhận được dữ liệu không hợp lệ. Vui lòng thử lại sau.',
};

export function getQuizAiErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Yêu cầu đã được hủy.';
  if (error instanceof ApiRequestError) {
    return QUIZ_AI_ERROR_MESSAGES[error.code]
      ?? (error.status === 401
        ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : error.status === 429
          ? 'Bạn đang tạo bài quá nhanh. Hãy chờ một lúc rồi thử lại.'
          : 'Không thể tạo bài luyện tập lúc này. Vui lòng thử lại.');
  }
  return 'Không thể tạo bài luyện tập lúc này. Vui lòng thử lại.';
}

export async function generatePracticeQuiz(request: PracticeQuizRequest, signal?: AbortSignal): Promise<PracticeQuizResponse> {
  const data = await apiPostOnce<unknown>(QUIZ_GENERATE_ENDPOINT, {
    query: request.query.trim(), difficulty: request.difficulty, count: request.count,
  }, { signal });
  return parsePracticeQuizResponse(data);
}

export function parsePracticeQuizResponse(value: unknown): PracticeQuizResponse {
  if (!record(value) || !Array.isArray(value.questions) || !Array.isArray(value.sources)
      || !Array.isArray(value.warnings) || !record(value.generation)) invalid();
  const questions = value.questions.map(parseQuestion);
  const sources = value.sources.map(parseSource);
  const warnings = value.warnings.map(warning => {
    if (typeof warning !== 'string') invalid();
    return warning;
  });
  const generation = value.generation;
  if (!positiveInt(generation.requestedCount) || !positiveInt(generation.generatedCount)
      || generation.generatedCount !== questions.length || generation.generatedCount > generation.requestedCount
      || typeof generation.partial !== 'boolean' || generation.partial !== (generation.generatedCount < generation.requestedCount)) invalid();
  const sourceIds = new Set(sources.map(source => source.chunkId));
  if (sourceIds.size !== sources.length || questions.some(question => question.sourceChunkIds.some(id => !sourceIds.has(id)))) invalid();
  return { questions, sources, warnings, generation: {
    requestedCount: generation.requestedCount, generatedCount: generation.generatedCount, partial: generation.partial,
  }};
}

function parseQuestion(value: unknown): AiGeneratedQuestion {
  const optionIds = ['A', 'B', 'C', 'D'] as const;
  if (!record(value) || typeof value.question !== 'string' || !value.question.trim()
      || typeof value.explanation !== 'string' || !value.explanation.trim()
      || !['EASY', 'MEDIUM', 'HARD'].includes(String(value.difficulty))
      || !Array.isArray(value.options) || value.options.length !== 4
      || !Array.isArray(value.sourceChunkIds) || value.sourceChunkIds.length === 0) invalid();
  const options = (value.options as unknown[]).map((option, index) => {
    if (!record(option) || option.id !== optionIds[index] || typeof option.text !== 'string' || !option.text.trim()) invalid();
    return { id: option.id as AiGeneratedQuestion['options'][number]['id'], text: option.text };
  });
  if (!optionIds.includes(value.correctOptionId as typeof optionIds[number])) invalid();
  const sourceChunkIds = value.sourceChunkIds.map(id => {
    if (typeof id !== 'string' || !id.trim()) invalid();
    return id;
  });
  if (new Set(sourceChunkIds).size !== sourceChunkIds.length) invalid();
  return { question: value.question, options, correctOptionId: value.correctOptionId as AiGeneratedQuestion['correctOptionId'],
    explanation: value.explanation, difficulty: value.difficulty as AiQuizDifficulty, sourceChunkIds };
}

function parseSource(value: unknown): AiQuizSource {
  if (!record(value) || typeof value.chunkId !== 'string' || !value.chunkId.trim()) invalid();
  for (const field of ['documentId', 'lessonTitle', 'sectionTitle', 'chunkHash'] as const) {
    if (value[field] !== null && typeof value[field] !== 'string') invalid();
  }
  for (const field of ['grade', 'lessonNumber', 'pageStart', 'pageEnd'] as const) {
    if (value[field] !== null && !Number.isInteger(value[field])) invalid();
  }
  return value as unknown as AiQuizSource;
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function positiveInt(value: unknown): value is number { return Number.isInteger(value) && Number(value) > 0; }
function invalid(): never { throw new ApiRequestError('AI_SERVICE_INVALID_RESPONSE', 'Invalid practice quiz response', 502); }
