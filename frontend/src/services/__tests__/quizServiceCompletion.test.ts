import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizSession } from '../../types/quiz';

const recordPracticeQuizCompletion = vi.hoisted(() => vi.fn());

vi.mock('../practiceQuizAttemptApi', () => ({
  recordPracticeQuizCompletion,
}));

import { saveQuizProgress, submitQuiz } from '../quizService';

const session: QuizSession = {
  sessionId: 'session-123',
  config: {
    query: 'Cách mạng tháng Tám',
    questionCount: 1,
    difficulty: 'medium',
    timeLimitMinutes: 10,
  },
  questions: [{
    id: 'q-1',
    questionText: 'Câu hỏi?',
    options: [
      { id: 'A', text: 'A' },
      { id: 'B', text: 'B' },
      { id: 'C', text: 'C' },
      { id: 'D', text: 'D' },
    ],
    correctOptionId: 'A',
    explanation: 'Giải thích',
    difficulty: 'medium',
    grade: 12,
    topic: 'Cách mạng tháng Tám',
    sourceRefs: [],
    generatedBy: 'rag',
  }],
  answers: [{ questionId: 'q-1', selectedOptionId: null }],
  questionStatuses: { 'q-1': 'unanswered' },
  startedAt: new Date(Date.now() - 30_000).toISOString(),
  submittedAt: null,
  currentQuestionIndex: 0,
  userId: 'student-1',
};

describe('quiz completion persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    recordPracticeQuizCompletion.mockReset().mockResolvedValue(undefined);
    saveQuizProgress(session);
  });

  it('records a safe completion receipt after producing the local result', async () => {
    const result = await submitQuiz(
      session.sessionId,
      [{ questionId: 'q-1', selectedOptionId: 'A' }],
      'student-1',
    );

    expect(result.correctCount).toBe(1);
    expect(recordPracticeQuizCompletion).toHaveBeenCalledWith(expect.objectContaining({
      clientSessionId: 'session-123',
      topic: 'Cách mạng tháng Tám',
      difficulty: 'medium',
      totalQuestions: 1,
    }));
  });

  it('keeps the completed local result when KPI recording is temporarily unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    recordPracticeQuizCompletion.mockRejectedValue(new Error('offline'));

    await expect(submitQuiz(
      session.sessionId,
      [{ questionId: 'q-1', selectedOptionId: 'A' }],
      'student-1',
    )).resolves.toMatchObject({ correctCount: 1 });
    expect(localStorage.getItem('quiz_result_session-123')).not.toBeNull();
  });
});
