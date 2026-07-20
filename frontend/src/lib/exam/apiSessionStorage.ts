import type { ExamSessionMode, ExamSessionResponse, SubmitAnswer } from '@/types/examApi';
import { loadStoredUser } from '@/services/apiClient';

const DRAFT_PREFIX = 'exam_api_session_draft_';
const TOKEN_PREFIX = 'exam_session_token_';
const LOCATOR_PREFIX = 'exam_api_session_locator_';
const STORAGE_VERSION = 1;

function locatorKey(routeKey: string): string {
  const ownerScope = loadStoredUser()?.id ?? 'anonymous';
  return `${LOCATOR_PREFIX}${ownerScope}:${routeKey}`;
}

export interface ApiSessionDraft {
  storageVersion: 1;
  sessionId: string;
  mode: ExamSessionMode;
  datasetVersion: string;
  startedAtServer: number;
  deadlineAt: number | null;
  questions: ExamSessionResponse['questions'];
  answers: Record<string, SubmitAnswer>;
  flags: string[];
  currentIndex: number;
  clientSubmissionId: string | null;
  status: ExamSessionResponse['status'];
  updatedAt: number;
}

function draftKey(sessionId: string): string {
  return `${DRAFT_PREFIX}${sessionId}`;
}

export function makeApiSessionDraft(response: ExamSessionResponse): ApiSessionDraft {
  return {
    storageVersion: STORAGE_VERSION,
    sessionId: response.sessionId,
    mode: response.mode,
    datasetVersion: response.datasetVersion,
    startedAtServer: response.startedAtServer,
    deadlineAt: response.deadlineAt,
    questions: response.questions,
    answers: {},
    flags: [],
    currentIndex: 0,
    clientSubmissionId: null,
    status: response.status,
    updatedAt: Date.now(),
  };
}

export function readApiSessionDraft(sessionId: string): ApiSessionDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(sessionId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ApiSessionDraft>;
    if (value.storageVersion !== STORAGE_VERSION || value.sessionId !== sessionId || !Array.isArray(value.questions)) return null;
    return value as ApiSessionDraft;
  } catch {
    return null;
  }
}

export function saveApiSessionDraft(draft: ApiSessionDraft): void {
  localStorage.setItem(draftKey(draft.sessionId), JSON.stringify({ ...draft, updatedAt: Date.now() }));
}

export function mergeApiSessionDraft(response: ExamSessionResponse, local: ApiSessionDraft | null): ApiSessionDraft {
  const next = makeApiSessionDraft(response);
  if (!local || local.datasetVersion !== response.datasetVersion) return next;
  return {
    ...next,
    answers: local.answers,
    flags: local.flags,
    currentIndex: Math.max(0, Math.min(local.currentIndex, Math.max(response.questions.length - 1, 0))),
    clientSubmissionId: local.clientSubmissionId,
  };
}

export function saveAnonymousSessionToken(sessionId: string, token: string): void {
  localStorage.setItem(`${TOKEN_PREFIX}${sessionId}`, token);
}

export function readAnonymousSessionToken(sessionId: string): string | null {
  return localStorage.getItem(`${TOKEN_PREFIX}${sessionId}`);
}

export function clearApiSessionStorage(sessionId: string): void {
  localStorage.removeItem(draftKey(sessionId));
  localStorage.removeItem(`${TOKEN_PREFIX}${sessionId}`);
}

export function saveApiSessionLocator(routeKey: string, sessionId: string): void {
  localStorage.setItem(locatorKey(routeKey), sessionId);
}

export function readApiSessionLocator(routeKey: string): string | null {
  return localStorage.getItem(locatorKey(routeKey));
}

export function clearApiSessionLocator(routeKey: string): void {
  localStorage.removeItem(locatorKey(routeKey));
}
