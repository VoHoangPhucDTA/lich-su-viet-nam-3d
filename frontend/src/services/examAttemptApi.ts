import { apiGet, apiPost, toQueryString } from './apiClient';

export interface ServerTimeResponse {
  serverTime: number;
  iso: string;
}

export interface ExamAttemptUpsertRequest {
  sessionId: string;
  mode: string;
  examId?: string | null;
  title?: string | null;
  isCustom?: boolean;
  sourceExamIds?: unknown;
  questionRefs?: unknown;
  questionSnapshots?: unknown;
  answers?: unknown;
  config?: unknown;
  result: unknown;
  totalQuestions: number;
  totalScore: number;
  mcqScore?: number | null;
  tfScore?: number | null;
  durationSeconds?: number | null;
  submittedAt: number;
}

export interface ExamAttemptSummaryResponse {
  sessionId: string;
  mode: string;
  examId?: string | null;
  title?: string | null;
  isCustom?: boolean;
  totalQuestions: number;
  totalScore: number | string;
  durationSeconds?: number | null;
  submittedAt: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExamAttemptListResponse {
  items: ExamAttemptSummaryResponse[];
}

export interface ExamAttemptDetailResponse extends ExamAttemptSummaryResponse {
  sourceExamIds?: unknown;
  questionRefs?: unknown;
  questionSnapshots?: unknown;
  answers?: unknown;
  config?: unknown;
  result?: unknown;
  mcqScore?: number | string | null;
  tfScore?: number | string | null;
}

export function getServerTime(): Promise<ServerTimeResponse> {
  return apiGet<ServerTimeResponse>('/api/time');
}

export function saveExamAttempt(request: ExamAttemptUpsertRequest): Promise<ExamAttemptSummaryResponse> {
  return apiPost<ExamAttemptSummaryResponse>('/api/exams/attempts', request);
}

export function listExamAttempts(limit?: number): Promise<ExamAttemptListResponse> {
  return apiGet<ExamAttemptListResponse>(`/api/exams/attempts${toQueryString({ limit })}`);
}

export function getExamAttemptDetail(sessionId: string): Promise<ExamAttemptDetailResponse> {
  return apiGet<ExamAttemptDetailResponse>(`/api/exams/attempts/${encodeURIComponent(sessionId)}`);
}
