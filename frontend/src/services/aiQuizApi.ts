import { ApiRequestError, apiPostOnce } from './apiClient';
import type {
  AiGeneratedOption,
  AiGeneratedQuestion,
  AiGeneratedQuizResponse,
  AiQuizDifficulty,
  AiQuizGenerationRequest,
  AiQuizSource,
} from '@/types/aiQuiz';

export const AI_QUIZ_ENDPOINT = '/api/exams/ai/generate';
export const AI_QUIZ_QUERY_MAX_LENGTH = 1000;
export const AI_QUIZ_COUNT_MIN = 1;
export const AI_QUIZ_COUNT_MAX = 10;
export const AI_QUIZ_DEFAULT_TOP_K = 5;

const OPTION_IDS = ['A', 'B', 'C', 'D'] as const;
const DIFFICULTIES: AiQuizDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

export const AI_QUIZ_ERROR_MESSAGES: Record<string, string> = {
  AI_INSUFFICIENT_CONTEXT: 'Chưa tìm thấy đủ nội dung phù hợp để tạo câu hỏi. Hãy mô tả chủ đề cụ thể hơn hoặc chọn lớp/bài khác.',
  AI_SERVICE_TIMEOUT: 'Quá trình tạo câu hỏi mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.',
  AI_SERVICE_UNAVAILABLE: 'Tính năng tạo câu hỏi đang tạm thời không khả dụng.',
  AI_STYLE_EXAMPLES_UNAVAILABLE: 'Tính năng tạo câu hỏi đang tạm thời không khả dụng.',
  AI_GENERATION_FAILED: 'Hệ thống chưa thể tạo bộ câu hỏi hợp lệ từ nội dung đã tìm thấy.',
  AI_SERVICE_CONTRACT_REJECTED: 'Thông tin yêu cầu chưa hợp lệ. Hãy kiểm tra lại các lựa chọn.',
  VALIDATION_ERROR: 'Thông tin yêu cầu chưa hợp lệ. Hãy kiểm tra lại các lựa chọn.',
  AI_SERVICE_DISABLED: 'Tính năng tạo câu hỏi bằng AI hiện đang được tắt.',
  AI_SERVICE_INVALID_RESPONSE: 'Hệ thống nhận được dữ liệu không hợp lệ. Vui lòng thử lại sau.',
};

export function getAiQuizErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Yêu cầu đã được hủy.';
  if (error instanceof ApiRequestError) {
    return AI_QUIZ_ERROR_MESSAGES[error.code]
      ?? (error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' : 'Không thể tạo bài luyện tập lúc này. Vui lòng thử lại.');
  }
  return 'Không thể tạo bài luyện tập lúc này. Vui lòng thử lại.';
}

export async function generateAiQuiz(
  request: Omit<AiQuizGenerationRequest, 'topK'> & { topK?: number },
  signal?: AbortSignal,
): Promise<AiGeneratedQuizResponse> {
  const publicRequest: AiQuizGenerationRequest = {
    query: request.query.trim(),
    grade: request.grade,
    difficulty: request.difficulty,
    count: request.count,
    topK: request.topK ?? AI_QUIZ_DEFAULT_TOP_K,
    ...(request.lessonNumber === undefined ? {} : { lessonNumber: request.lessonNumber }),
    ...(request.documentId === undefined ? {} : { documentId: request.documentId.trim() }),
  };
  const response = await apiPostOnce<unknown>(AI_QUIZ_ENDPOINT, publicRequest, { signal });
  return parseAiQuizResponse(response);
}

export function parseAiQuizResponse(value: unknown): AiGeneratedQuizResponse {
  if (!isRecord(value) || !Array.isArray(value.questions) || !Array.isArray(value.sources)
      || !Array.isArray(value.warnings) || !isRecord(value.generation) || !isRecord(value.generationReceipt)) invalid();

  const questions = value.questions.map(parseQuestion);
  const sources = value.sources.map(parseSource);
  const warnings = value.warnings.map((warning) => {
    if (typeof warning !== 'string') invalid();
    return warning;
  });
  const { requestedCount, generatedCount, partial } = value.generation;
  const { id: receiptId, expiresAt } = value.generationReceipt;
  if (!isPositiveInteger(requestedCount) || !isPositiveInteger(generatedCount)
      || generatedCount !== questions.length || generatedCount > requestedCount || typeof partial !== 'boolean'
      || partial !== (generatedCount < requestedCount) || typeof receiptId !== 'string' || !receiptId
      || typeof expiresAt !== 'string' || !expiresAt) invalid();

  const sourceIds = new Set(sources.map((source) => source.chunkId));
  if (sourceIds.size !== sources.length
      || questions.some((question) => question.sourceChunkIds.some((id) => !sourceIds.has(id)))) invalid();

  return { questions, sources, warnings, generation: { requestedCount, generatedCount, partial }, generationReceipt: { id: receiptId, expiresAt } };
}

function parseQuestion(value: unknown): AiGeneratedQuestion {
  if (!isRecord(value) || typeof value.question !== 'string' || !value.question.trim()
      || typeof value.explanation !== 'string' || !value.explanation.trim()
      || !DIFFICULTIES.includes(value.difficulty as AiQuizDifficulty)
      || !Array.isArray(value.options) || value.options.length !== 4
      || !Array.isArray(value.sourceChunkIds) || value.sourceChunkIds.length === 0) invalid();
  const options = value.options.map(parseOption);
  if (options.some((option, index) => option.id !== OPTION_IDS[index])
      || !OPTION_IDS.includes(value.correctOptionId as typeof OPTION_IDS[number])) invalid();
  const sourceChunkIds = value.sourceChunkIds.map((id) => {
    if (typeof id !== 'string' || !id.trim()) invalid();
    return id;
  });
  if (new Set(sourceChunkIds).size !== sourceChunkIds.length) invalid();
  return {
    question: value.question,
    options,
    correctOptionId: value.correctOptionId as AiGeneratedQuestion['correctOptionId'],
    explanation: value.explanation,
    difficulty: value.difficulty as AiQuizDifficulty,
    sourceChunkIds,
  };
}

function parseOption(value: unknown): AiGeneratedOption {
  if (!isRecord(value) || !OPTION_IDS.includes(value.id as typeof OPTION_IDS[number])
      || typeof value.text !== 'string' || !value.text.trim()) invalid();
  return { id: value.id as AiGeneratedOption['id'], text: value.text };
}

function parseSource(value: unknown): AiQuizSource {
  if (!isRecord(value) || typeof value.chunkId !== 'string' || !value.chunkId.trim()) invalid();
  for (const field of ['documentId', 'lessonTitle', 'sectionTitle'] as const) {
    if (value[field] !== null && typeof value[field] !== 'string') invalid();
  }
  if (value.chunkHash !== null && typeof value.chunkHash !== 'string') invalid();
  for (const field of ['grade', 'lessonNumber', 'pageStart', 'pageEnd'] as const) {
    if (value[field] !== null && !Number.isInteger(value[field])) invalid();
  }
  return value as unknown as AiQuizSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function invalid(): never {
  throw new ApiRequestError('AI_SERVICE_INVALID_RESPONSE', 'Invalid AI quiz response', 502);
}
