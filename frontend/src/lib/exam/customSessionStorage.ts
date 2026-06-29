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
  return {
    sessionId,
    mode: 'custom_practice',
    title: buildCustomSessionTitle(config, questionSnapshots.length),
    createdAt: new Date().toISOString(),
    config,
    questionRefs,
    sourceExamIds,
    questionSnapshots,
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

export function deleteCustomSession(sessionId: string): void {
  localStorage.removeItem(`${CUSTOM_SESSION_PREFIX}${sessionId}`);
}

function buildCustomSessionTitle(config: CustomExamConfig, actualCount: number): string {
  const scope = config.scopeTitle && config.scopeType !== 'all' ? ` - ${config.scopeTitle}` : '';
  return `Luyện tập tùy chọn ${actualCount} câu${scope}`;
}
