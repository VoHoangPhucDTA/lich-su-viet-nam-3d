import type {
  QuizAnswer, QuizConfig, QuizQuestion, QuizQuestionResult, QuizResult, QuizSession,
} from '../types/quiz';
import { generatePracticeQuiz } from './quizAiApi';
import { recordPracticeQuizCompletion } from './practiceQuizAttemptApi';

const SESSION_PREFIX = 'quiz_session_';
const RESULT_PREFIX = 'quiz_result_';
const HISTORY_KEY = 'quiz_history';

function generateId(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function generateQuiz(config: QuizConfig, userId = 'guest', signal?: AbortSignal): Promise<QuizSession> {
  const response = await generatePracticeQuiz({
    query: config.query,
    difficulty: config.difficulty === 'mixed' ? 'MEDIUM' : config.difficulty.toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD',
    count: config.questionCount,
  }, signal);
  const questions: QuizQuestion[] = response.questions.map((question, index) => {
    const linkedSources = response.sources.filter(source => question.sourceChunkIds.includes(source.chunkId));
    const grades = [...new Set(linkedSources.map(source => source.grade).filter((grade): grade is 10 | 11 | 12 => grade === 10 || grade === 11 || grade === 12))];
    const grade = grades.length === 1 ? grades[0] : 'all';
    return {
      id: `ai-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      questionText: question.question,
      options: question.options,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      difficulty: question.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard',
      grade,
      topic: config.query,
      sourceRefs: linkedSources.map(source => ({
        title: [source.lessonTitle, source.sectionTitle].filter(Boolean).join(' — ') || `SGK Lớp ${source.grade ?? '10–12'}`,
        location: [source.lessonNumber ? `Bài ${source.lessonNumber}` : '', source.pageStart ? `trang ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ''}` : ''].filter(Boolean).join(', ') || 'Nguồn SGK',
      })),
      generatedBy: 'rag',
    };
  });
  if (questions.length === 0) throw new Error('AI_INSUFFICIENT_CONTEXT');
  const session: QuizSession = {
    sessionId: generateId(),
    config: { ...config, questionCount: questions.length },
    questions,
    answers: questions.map(question => ({ questionId: question.id, selectedOptionId: null })),
    questionStatuses: Object.fromEntries(questions.map(question => [question.id, 'unanswered'])),
    startedAt: new Date().toISOString(),
    submittedAt: null,
    currentQuestionIndex: 0,
    userId,
    generation: { ...response.generation, warnings: response.warnings },
  };
  saveQuizProgress(session);
  return session;
}

export async function getQuizSession(sessionId: string, userId?: string): Promise<QuizSession | null> {
  await delay(100);
  const session = loadQuizProgress(sessionId);
  return !session || (userId !== undefined && session.userId !== userId) ? null : session;
}

export async function submitQuiz(sessionId: string, answers: QuizAnswer[], userId?: string): Promise<QuizResult> {
  await delay(100);
  const session = loadQuizProgress(sessionId);
  if (!session || (userId !== undefined && session.userId !== userId)) throw new Error(`Session ${sessionId} không tồn tại.`);
  const questionResults: QuizQuestionResult[] = session.questions.map(question => {
    const answer = answers.find(item => item.questionId === question.id);
    const selectedOptionId = answer?.selectedOptionId ?? null;
    return { question, selectedOptionId, isCorrect: selectedOptionId === question.correctOptionId, timeSpentMs: answer?.timeSpentMs };
  });
  const correctCount = questionResults.filter(result => result.isCorrect).length;
  const skippedCount = questionResults.filter(result => result.selectedOptionId === null).length;
  const totalQuestions = questionResults.length;
  const result: QuizResult = {
    resultId: generateId(), sessionId, userId: session.userId, config: session.config,
    totalQuestions, correctCount, incorrectCount: totalQuestions - correctCount - skippedCount, skippedCount,
    percentageScore: totalQuestions ? Math.round(correctCount / totalQuestions * 100) : 0,
    score10: totalQuestions ? Number((correctCount / totalQuestions * 10).toFixed(1)) : 0,
    totalTimeMs: Date.now() - new Date(session.startedAt).getTime(), completedAt: new Date().toISOString(),
    questionResults, difficultyBreakdown: buildDifficultyBreakdown(questionResults), gradeBreakdown: buildGradeBreakdown(questionResults),
  };
  localStorage.setItem(`${RESULT_PREFIX}${sessionId}`, JSON.stringify(result));
  saveQuizProgress({ ...session, answers, submittedAt: new Date().toISOString() });
  appendToHistory(result);
  try {
    await recordPracticeQuizCompletion({
      clientSessionId: session.sessionId,
      topic: session.config.query,
      difficulty: session.config.difficulty,
      totalQuestions,
      durationMs: Math.min(result.totalTimeMs, 86_400_000),
    });
  } catch (error) {
    // Kết quả cục bộ vẫn dùng được; lần ghi KPI không được làm mất bài vừa hoàn thành.
    console.warn('[quiz] Không thể ghi nhận lượt hoàn thành cho hồ sơ học tập.', error);
  }
  return result;
}

export async function getQuizResult(sessionId: string, userId?: string): Promise<QuizResult | null> {
  await delay(100);
  const raw = localStorage.getItem(`${RESULT_PREFIX}${sessionId}`);
  const result = raw ? JSON.parse(raw) as QuizResult : null;
  return !result || (userId !== undefined && result.userId !== userId) ? null : result;
}

export async function getQuizHistory(userId = 'guest'): Promise<QuizResult[]> {
  await delay(100);
  const raw = localStorage.getItem(HISTORY_KEY);
  const history: QuizResult[] = raw ? JSON.parse(raw) : [];
  return history.filter(result => result.userId === userId).sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}

export function saveQuizProgress(session: QuizSession): void { localStorage.setItem(`${SESSION_PREFIX}${session.sessionId}`, JSON.stringify(session)); }
export function loadQuizProgress(sessionId: string): QuizSession | null {
  const raw = localStorage.getItem(`${SESSION_PREFIX}${sessionId}`);
  return raw ? JSON.parse(raw) as QuizSession : null;
}

function buildDifficultyBreakdown(results: QuizQuestionResult[]) {
  const breakdown = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };
  for (const result of results) {
    const bucket = breakdown[result.question.difficulty as keyof typeof breakdown];
    if (bucket) { bucket.total++; if (result.isCorrect) bucket.correct++; }
  }
  return breakdown;
}

function buildGradeBreakdown(results: QuizQuestionResult[]) {
  const breakdown: QuizResult['gradeBreakdown'] = {};
  for (const result of results) {
    const grade = result.question.grade;
    if (grade === 'all') continue;
    breakdown[grade] ??= { correct: 0, total: 0 };
    breakdown[grade]!.total++;
    if (result.isCorrect) breakdown[grade]!.correct++;
  }
  return breakdown;
}

function appendToHistory(result: QuizResult): void {
  const raw = localStorage.getItem(HISTORY_KEY);
  const history: QuizResult[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(HISTORY_KEY, JSON.stringify([result, ...history.filter(item => item.resultId !== result.resultId)].slice(0, 50)));
}

export function getDefaultConfig(): QuizConfig {
  return { query: '', questionCount: 5, difficulty: 'medium', timeLimitMinutes: 15 };
}
