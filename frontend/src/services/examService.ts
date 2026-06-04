import type { ExamConfig, ExamSession, ExamResult, ExamAnswer } from '../types/exam';
import { MOCK_EXAM_QUESTIONS } from '../data/mockExamQuestions';

// UUID generator mock
function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Memory caching (mocking DB)
const EXAM_SESSION_PREFIX = 'exam_session_';
const EXAM_RESULT_PREFIX = 'exam_result_';
const EXAM_HISTORY_KEY = 'exam_history';

export async function createExam(config: ExamConfig, _userId?: string): Promise<ExamSession> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  let pool = [...MOCK_EXAM_QUESTIONS];

  // Filters
  if (config.difficulty !== 'mixed') {
    pool = pool.filter(q => q.difficulty === config.difficulty);
  }
  if (!config.gradeScope.includes('all')) {
    pool = pool.filter(q => config.gradeScope.includes(q.grade));
  }
  if (config.topics && config.topics.length > 0) {
    pool = pool.filter(q => config.topics!.includes(q.topic));
  }

  // Shuffle pool
  if (config.shuffleQuestions) {
    pool = pool.sort(() => 0.5 - Math.random());
  }

  // Cap at question count
  let selected = pool.slice(0, config.questionCount);

  // If not enough questions, padd randomly from original pool
  if (selected.length < config.questionCount) {
     const remainingCount = config.questionCount - selected.length;
     const padding = [...MOCK_EXAM_QUESTIONS].sort(() => 0.5 - Math.random()).slice(0, remainingCount);
     selected = [...selected, ...padding];
  }

  const examId = `exam-${generateId()}`;
  
  const initialAnswers: ExamAnswer[] = selected.map(q => ({
    questionId: q.id,
    selectedOptionId: null
  }));

  const session: ExamSession = {
    examId,
    config,
    questions: selected,
    answers: initialAnswers,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    currentQuestionIndex: 0,
    remainingSeconds: config.timeLimitMinutes > 0 ? config.timeLimitMinutes * 60 : undefined
  };

  saveExamProgress(session);
  return session;
}

export async function getExamSession(examId: string): Promise<ExamSession | null> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const data = localStorage.getItem(`${EXAM_SESSION_PREFIX}${examId}`);
  if (data) {
    return JSON.parse(data) as ExamSession;
  }
  return null;
}

export function saveExamProgress(session: ExamSession): void {
  localStorage.setItem(`${EXAM_SESSION_PREFIX}${session.examId}`, JSON.stringify(session));
}

export function loadExamProgress(examId: string): ExamSession | null {
  const data = localStorage.getItem(`${EXAM_SESSION_PREFIX}${examId}`);
  if (data) return JSON.parse(data) as ExamSession;
  return null;
}

export async function submitExam(examId: string, answers: ExamAnswer[], userId?: string): Promise<ExamResult> {
  await new Promise(resolve => setTimeout(resolve, 600));

  const session = loadExamProgress(examId);
  if (!session) {
    throw new Error('Exam session not found');
  }

  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;

  const answersReview = session.questions.map(q => {
    const ans = answers.find(a => a.questionId === q.id);
    const selectedOptionId = ans ? ans.selectedOptionId : null;
    const isCorrect = selectedOptionId === q.correctOptionId;

    if (selectedOptionId === null || selectedOptionId === undefined) {
      blankCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
    }

    return {
      questionId: q.id,
      isCorrect,
      selectedOptionId: selectedOptionId || null
    };
  });

  const totalQuestions = session.questions.length;
  const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
  const score10 = totalQuestions > 0 ? (correctCount / totalQuestions) * 10 : 0;
  
  const startedAt = new Date(session.startedAt).getTime();
  const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);

  const result: ExamResult = {
    examId,
    userId,
    config: session.config,
    totalQuestions,
    correctCount,
    wrongCount,
    blankCount,
    score10: parseFloat(score10.toFixed(2)),
    percentage: parseFloat(percentage.toFixed(2)),
    durationSeconds,
    submittedAt: new Date().toISOString(),
    answersReview
  };

  // Update session status
  session.status = 'submitted';
  session.submittedAt = result.submittedAt;
  session.answers = answers;
  saveExamProgress(session);

  // Save result locally
  localStorage.setItem(`${EXAM_RESULT_PREFIX}${examId}`, JSON.stringify(result));

  // Add to history
  const historyRaw = localStorage.getItem(EXAM_HISTORY_KEY);
  const history: ExamResult[] = historyRaw ? JSON.parse(historyRaw) : [];
  history.unshift(result);
  localStorage.setItem(EXAM_HISTORY_KEY, JSON.stringify(history));

  return result;
}

export async function getExamHistory(userId?: string): Promise<ExamResult[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const data = localStorage.getItem(EXAM_HISTORY_KEY);
  if (data) {
    const history = JSON.parse(data) as ExamResult[];
    if (userId) {
      // Return history matching userId OR history with no userId (created before auth) - just matching userId is safer for production
      return history.filter(h => h.userId === userId);
    }
    // If no userId provided, it means guest - maybe return guest exams only
    return history.filter(h => !h.userId);
  }
  return [];
}

export async function getExamResult(examId: string): Promise<{ result: ExamResult; session: ExamSession } | null> {
  await new Promise(resolve => setTimeout(resolve, 300));
  const resultData = localStorage.getItem(`${EXAM_RESULT_PREFIX}${examId}`);
  const sessionData = localStorage.getItem(`${EXAM_SESSION_PREFIX}${examId}`);
  
  if (resultData && sessionData) {
    return {
      result: JSON.parse(resultData) as ExamResult,
      session: JSON.parse(sessionData) as ExamSession
    };
  }
  return null;
}

export async function retakeExam(examId: string, userId?: string): Promise<string> {
  const session = loadExamProgress(examId);
  if (!session) throw new Error('Cannot retake unexisting exam');
  
  // Create a completely new session with same configuration
  const newSession = await createExam(session.config, userId);
  return newSession.examId;
}
