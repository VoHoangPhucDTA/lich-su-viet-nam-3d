import { ApiRequestError, apiGet, apiPost } from './apiClient';
import type {
  CheckedQuestionResult,
  CreateExamSessionRequest,
  CustomPreviewRequest,
  CustomPreviewResponse,
  ExamCatalogDetail,
  ExamCatalogList,
  ExamSessionResponse,
  ExamSessionSubmitResponse,
  ExamTopicList,
  SafeQuestionType,
  RecoverExamSubmissionRequest,
  SubmitRequest,
} from '@/types/examApi';

export interface ExamApiRequestOptions {
  anonymousSessionToken?: string | null;
  signal?: AbortSignal;
}

function sessionHeaders(options: ExamApiRequestOptions): HeadersInit | undefined {
  return options.anonymousSessionToken
    ? { 'X-Exam-Session-Token': options.anonymousSessionToken }
    : undefined;
}

/** Only transport/backend failures may switch a page to its static fallback. */
export function isExamApiFallbackError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.status === 0 || error.status >= 500;
  }
  return error instanceof TypeError;
}

export function getExamApiErrorCode(error: unknown): string | null {
  return error instanceof ApiRequestError ? error.code : null;
}

export function listCatalog(view: 'verified' | 'reviewable' = 'verified', signal?: AbortSignal): Promise<ExamCatalogList> {
  return apiGet<ExamCatalogList>(`/api/exams?view=${encodeURIComponent(view)}`, { signal });
}

export function getCatalogDetail(examId: string, signal?: AbortSignal): Promise<ExamCatalogDetail> {
  return apiGet<ExamCatalogDetail>(`/api/exams/${encodeURIComponent(examId)}`, { signal });
}

export function listTopicMetadata(signal?: AbortSignal): Promise<ExamTopicList> {
  return apiGet<ExamTopicList>('/api/exams/topics', { signal });
}

export function previewCustomExam(request: CustomPreviewRequest, signal?: AbortSignal): Promise<CustomPreviewResponse> {
  return apiPost<CustomPreviewResponse>('/api/exams/custom/preview', request, { signal });
}

export function createExamSession(request: CreateExamSessionRequest, signal?: AbortSignal): Promise<ExamSessionResponse> {
  return apiPost<ExamSessionResponse>('/api/exam-sessions', request, { signal });
}

export function resumeExamSession(sessionId: string, options: ExamApiRequestOptions = {}): Promise<ExamSessionResponse> {
  return apiGet<ExamSessionResponse>(`/api/exam-sessions/${encodeURIComponent(sessionId)}`, {
    signal: options.signal,
    headers: sessionHeaders(options),
  });
}

export function checkExamQuestion(
  sessionId: string,
  questionInstanceId: string,
  questionType: SafeQuestionType,
  selected: unknown,
  options: ExamApiRequestOptions = {},
): Promise<CheckedQuestionResult> {
  return apiPost<CheckedQuestionResult>(
    `/api/exam-sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionInstanceId)}/check`,
    { questionType, selected },
    { signal: options.signal, headers: sessionHeaders(options) },
  );
}

export function completeExamPractice(sessionId: string, options: ExamApiRequestOptions = {}) {
  return apiPost<ExamSessionResponse['practiceSummary']>(
    `/api/exam-sessions/${encodeURIComponent(sessionId)}/complete`,
    undefined,
    { signal: options.signal, headers: sessionHeaders(options) },
  );
}

export function submitExamSession(sessionId: string, request: SubmitRequest, options: ExamApiRequestOptions = {}): Promise<ExamSessionSubmitResponse> {
  return apiPost<ExamSessionSubmitResponse>(
    `/api/exam-sessions/${encodeURIComponent(sessionId)}/submit`,
    request,
    { signal: options.signal, headers: sessionHeaders(options) },
  );
}

export function recoverExamSubmission(request: RecoverExamSubmissionRequest): Promise<ExamSessionSubmitResponse> {
  return apiPost<ExamSessionSubmitResponse>('/api/exam-submissions/recover', request);
}
