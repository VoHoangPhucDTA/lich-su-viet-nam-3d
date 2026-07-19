import { apiGet, toQueryString } from './apiClient';

export interface ServerTimeResponse {
  serverTime: number;
  iso: string;
}

export interface ExamAttemptSummaryResponse {
  sessionId: string;
  mode: string;
  examId?: string | null;
  title?: string | null;
  isCustom?: boolean;
  totalQuestions: number;
  totalScore: number | string;
  mcqScore?: number | string | null;
  tfScore?: number | string | null;
  durationSeconds?: number | null;
  submittedAt: number;
  scoreAuthority?: string | null;
  timingAuthority?: string | null;
  submissionOrigin?: string | null;
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
}

export function getServerTime(): Promise<ServerTimeResponse> {
  return apiGet<ServerTimeResponse>('/api/time');
}

export function listExamAttempts(limit?: number): Promise<ExamAttemptListResponse> {
  return apiGet<ExamAttemptListResponse>(`/api/exams/attempts${toQueryString({ limit })}`);
}

export function getExamAttemptDetail(sessionId: string): Promise<ExamAttemptDetailResponse> {
  return apiGet<ExamAttemptDetailResponse>(`/api/exams/attempts/${encodeURIComponent(sessionId)}`);
}
