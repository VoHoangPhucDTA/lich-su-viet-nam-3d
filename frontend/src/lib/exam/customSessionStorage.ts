import type {
  CustomExamConfig,
  CustomExamSession,
  CustomPracticeState,
  CustomQuestionSnapshot,
  QuestionRef,
} from '@/types/exam';

const CUSTOM_SESSION_PREFIX = 'custom_exam_session_';

export function makeCustomSessionId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCustomSession({
  config,
  questionSnapshots,
  questionRefs,
  sourceExamIds,
}: {
  config: CustomExamConfig;
  questionSnapshots: CustomQuestionSnapshot[];
  questionRefs: QuestionRef[];
  sourceExamIds: string[];
}): CustomExamSession {
  const sessionId = makeCustomSessionId();
  const startedAt = Date.now();
  return {
    sessionId,
    mode: config.mode,
    title: buildCustomSessionTitle(config, questionSnapshots.length),
    createdAt: new Date().toISOString(),
    startedAt,
    durationSeconds: config.durationSeconds ?? null,
    status: 'in_progress',
    config,
    questionRefs,
    sourceExamIds,
    questionSnapshots,
    markedForReview: [],
    practiceState: {
      answers: {},
      checked: {},
      currentIndex: 0,
      finished: false,
    },
  };
}

export function saveCustomSession(session: CustomExamSession): void {
  localStorage.setItem(`${CUSTOM_SESSION_PREFIX}${session.sessionId}`, JSON.stringify(session));
}

export function loadCustomSession(sessionId: string): CustomExamSession | null {
  try {
    const raw = localStorage.getItem(`${CUSTOM_SESSION_PREFIX}${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomExamSession;
    if (!parsed?.sessionId || !Array.isArray(parsed.questionSnapshots)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCustomPracticeState(sessionId: string, practiceState: CustomPracticeState): CustomExamSession | null {
  const session = loadCustomSession(sessionId);
  if (!session) return null;
  const next: CustomExamSession = { ...session, practiceState };
  saveCustomSession(next);
  return next;
}

export function updateCustomSession(sessionId: string, patch: Partial<CustomExamSession>): CustomExamSession | null {
  const session = loadCustomSession(sessionId);
  if (!session) return null;
  const next: CustomExamSession = { ...session, ...patch };
  saveCustomSession(next);
  return next;
}

export function deleteCustomSession(sessionId: string): void {
  localStorage.removeItem(`${CUSTOM_SESSION_PREFIX}${sessionId}`);
}

function buildCustomSessionTitle(config: CustomExamConfig, actualCount: number): string {
  const scope = config.scopeTitle && config.scopeType !== 'all' ? ` - ${config.scopeTitle}` : '';
  const prefix = config.mode === 'custom_mock' ? 'Thi thử tùy chọn' : 'Luyện tập tùy chọn';
  return `${prefix} ${actualCount} câu${scope}`;
}
