/**
 * Quiz Service – Mock implementation (backend-ready)
 *
 * Replace the localStorage logic with real API calls to FastAPI/LangChain:
 *   generateQuiz  → POST /api/quiz/generate
 *   submitQuiz    → POST /api/quiz/{sessionId}/submit
 *   getQuizSession → GET /api/quiz/session/{sessionId}
 *   getQuizHistory → GET /api/quiz/history?userId=...
 */

import type {
  QuizConfig,
  QuizSession,
  QuizAnswer,
  QuizResult,
  QuizQuestion,
  QuizQuestionResult,
  QuizDifficulty,
} from '../types/quiz';
import { MOCK_QUIZ_QUESTIONS, filterQuestions } from '../data/mockQuizQuestions';

// ─── Storage keys ─────────────────────────────────────────────────────────────
const SESSION_PREFIX = 'quiz_session_';
const RESULT_PREFIX  = 'quiz_result_';
const HISTORY_KEY    = 'quiz_history';

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── generateQuiz ─────────────────────────────────────────────────────────────

/**
 * Generates a quiz session based on the provided config.
 * Currently uses local mock data; replace body with API call for RAG backend.
 */
export async function generateQuiz(
  config: QuizConfig,
  userId = 'guest',
): Promise<QuizSession> {
  // Simulate network latency (remove when using real API)
  await delay(600 + Math.random() * 400);

  // 1. Filter questions based on config
  let pool: QuizQuestion[] = filterQuestions(
    config.grade === 'all' ? undefined : config.grade,
    config.difficulty,
    config.eventTypes,
    config.topic,
  );

  // 2. Handle period filter
  if (config.period && pool.length > 0) {
    // Note: mockQuizQuestions don't store year; skip in mock. RAG backend handles this.
    console.info('[QuizService] Period filter is a no-op in mock mode');
  }

  // 3. Fallback: if not enough questions, expand the pool
  if (pool.length < config.questionCount) {
    const extras = MOCK_QUIZ_QUESTIONS.filter(q => !pool.find(p => p.id === q.id));
    pool = [...pool, ...shuffle(extras)];
  }

  if (pool.length === 0) {
    throw new Error('Không tìm thấy câu hỏi phù hợp. Hãy thử điều chỉnh bộ lọc.');
  }

  // 4. Pick questions
  const selected = shuffle(pool).slice(0, Math.min(config.questionCount, pool.length));

  // 5. Build session
  const sessionId = generateId();
  const session: QuizSession = {
    sessionId,
    config,
    questions: selected,
    answers: selected.map(q => ({ questionId: q.id, selectedOptionId: null })),
    questionStatuses: Object.fromEntries(selected.map(q => [q.id, 'unanswered'])),
    startedAt: new Date().toISOString(),
    submittedAt: null,
    currentQuestionIndex: 0,
    userId,
  };

  // 6. Persist
  saveQuizProgress(session);
  return session;
}

// ─── getQuizSession ───────────────────────────────────────────────────────────

/** Load a session from localStorage (swap with GET /api/quiz/session/:id) */
export async function getQuizSession(sessionId: string): Promise<QuizSession | null> {
  await delay(150);
  return loadQuizProgress(sessionId);
}

// ─── submitQuiz ───────────────────────────────────────────────────────────────

/** Submit answers and compute result (swap with POST /api/quiz/:id/submit) */
export async function submitQuiz(
  sessionId: string,
  answers: QuizAnswer[],
): Promise<QuizResult> {
  await delay(500 + Math.random() * 300);

  const session = loadQuizProgress(sessionId);
  if (!session) throw new Error(`Session ${sessionId} không tồn tại.`);

  const startedAt = new Date(session.startedAt).getTime();
  const now = Date.now();
  const totalTimeMs = now - startedAt;

  // ── Score calculation ──
  const questionResults: QuizQuestionResult[] = session.questions.map(q => {
    const ans = answers.find(a => a.questionId === q.id);
    const selected = ans?.selectedOptionId ?? null;
    return {
      question: q,
      selectedOptionId: selected,
      isCorrect: selected === q.correctOptionId,
      timeSpentMs: ans?.timeSpentMs,
    };
  });

  const correctCount   = questionResults.filter(r => r.isCorrect).length;
  const skippedCount   = questionResults.filter(r => r.selectedOptionId === null).length;
  const incorrectCount = questionResults.length - correctCount - skippedCount;
  const totalQuestions = questionResults.length;
  const percentageScore = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const score10 = parseFloat(((correctCount / totalQuestions) * 10).toFixed(1));

  // ── Difficulty breakdown ──
  const difficultyBreakdown = buildDifficultyBreakdown(questionResults);
  const gradeBreakdown      = buildGradeBreakdown(questionResults);

  // ── Build result ──
  const result: QuizResult = {
    resultId: generateId(),
    sessionId,
    userId: session.userId,
    config: session.config,
    totalQuestions,
    correctCount,
    incorrectCount,
    skippedCount,
    percentageScore,
    score10,
    totalTimeMs,
    completedAt: new Date().toISOString(),
    questionResults,
    difficultyBreakdown,
    gradeBreakdown,
  };

  // ── Persist ──
  localStorage.setItem(`${RESULT_PREFIX}${sessionId}`, JSON.stringify(result));

  // Update session as submitted
  const updatedSession: QuizSession = {
    ...session,
    answers,
    submittedAt: new Date().toISOString(),
  };
  saveQuizProgress(updatedSession);

  // Append to history
  appendToHistory(result);

  return result;
}

// ─── getQuizResult ────────────────────────────────────────────────────────────

/** Load a result by sessionId (swap with GET /api/quiz/result/:sessionId) */
export async function getQuizResult(sessionId: string): Promise<QuizResult | null> {
  await delay(150);
  const raw = localStorage.getItem(`${RESULT_PREFIX}${sessionId}`);
  return raw ? (JSON.parse(raw) as QuizResult) : null;
}

// ─── getQuizHistory ───────────────────────────────────────────────────────────

/** Get user's quiz history (swap with GET /api/quiz/history) */
export async function getQuizHistory(_userId?: string): Promise<QuizResult[]> {
  await delay(250);
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  const all: QuizResult[] = JSON.parse(raw);
  // In mock mode we return all; real backend would filter by userId
  return all.sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
}

// ─── Progress helpers ─────────────────────────────────────────────────────────

/** Persist session to localStorage */
export function saveQuizProgress(session: QuizSession): void {
  localStorage.setItem(`${SESSION_PREFIX}${session.sessionId}`, JSON.stringify(session));
}

/** Load session from localStorage */
export function loadQuizProgress(sessionId: string): QuizSession | null {
  const raw = localStorage.getItem(`${SESSION_PREFIX}${sessionId}`);
  return raw ? (JSON.parse(raw) as QuizSession) : null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildDifficultyBreakdown(results: QuizQuestionResult[]) {
  const bd = {
    easy:   { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    hard:   { correct: 0, total: 0 },
  };
  for (const r of results) {
    const d = r.question.difficulty as keyof typeof bd;
    if (d in bd) {
      bd[d].total++;
      if (r.isCorrect) bd[d].correct++;
    }
  }
  return bd;
}

function buildGradeBreakdown(results: QuizQuestionResult[]) {
  const bd: Partial<Record<10 | 11 | 12, { correct: number; total: number }>> = {};
  for (const r of results) {
    const g = r.question.grade as 10 | 11 | 12;
    if (!bd[g]) bd[g] = { correct: 0, total: 0 };
    bd[g]!.total++;
    if (r.isCorrect) bd[g]!.correct++;
  }
  return bd;
}

function appendToHistory(result: QuizResult): void {
  const raw = localStorage.getItem(HISTORY_KEY);
  const history: QuizResult[] = raw ? JSON.parse(raw) : [];
  // Avoid duplicates
  const idx = history.findIndex(r => r.resultId === result.resultId);
  if (idx >= 0) history[idx] = result;
  else history.unshift(result);
  // Keep at most 50 entries
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

// ─── Default quiz config ──────────────────────────────────────────────────────

export function getDefaultConfig(): QuizConfig {
  return {
    questionCount: 10,
    difficulty: 'mixed' as QuizDifficulty,
    sourceMode: 'mixed',
    timeLimitMinutes: 15,
  };
}
