import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuizResultPage from '../QuizResultPage';
import type { QuizResult } from '@/types/quiz';

const mocks = vi.hoisted(() => ({
  getQuizResult: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'user-1' } }),
}));

vi.mock('@/services/quizService', () => ({
  getQuizResult: mocks.getQuizResult,
}));

const result: QuizResult = {
  resultId: 'result-1',
  sessionId: 'session-1',
  userId: 'user-1',
  config: { query: 'Cách mạng tháng Tám', questionCount: 1, difficulty: 'medium', timeLimitMinutes: 5 },
  totalQuestions: 1,
  correctCount: 0,
  incorrectCount: 1,
  skippedCount: 0,
  percentageScore: 0,
  score10: 0,
  totalTimeMs: 60_000,
  completedAt: '2026-07-30T00:00:00.000Z',
  questionResults: [{
    selectedOptionId: 'B',
    isCorrect: false,
    question: {
      id: 'q-1',
      questionText: 'Câu hỏi',
      options: [
        { id: 'A', text: 'Đúng' },
        { id: 'B', text: 'Sai' },
        { id: 'C', text: 'C' },
        { id: 'D', text: 'D' },
      ],
      correctOptionId: 'A',
      explanation: 'Theo nguồn SGK',
      difficulty: 'medium',
      grade: 12,
      topic: 'Cách mạng tháng Tám',
      sourceRefs: [{ title: 'SGK Lịch sử 12', location: 'Bài 6' }],
      generatedBy: 'rag',
    },
  }],
  difficultyBreakdown: {
    easy: { correct: 0, total: 0 },
    medium: { correct: 0, total: 1 },
    hard: { correct: 0, total: 0 },
  },
  gradeBreakdown: { 12: { correct: 0, total: 1 } },
};

describe('QuizResultPage navigation', () => {
  beforeEach(() => {
    mocks.getQuizResult.mockReset();
    mocks.getQuizResult.mockResolvedValue(result);
  });

  it('uses explicit module-home, new-quiz, history and review-topic routes', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/quiz/result/session-1']}>
        <Routes>
          <Route path="/quiz/result/:sessionId" element={<QuizResultPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const back = await screen.findByRole('link', { name: 'Về trang trắc nghiệm' });
    expect(back).toHaveAttribute('href', '/quiz');
    expect(back.querySelector('[data-result-back-icon]')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo bài luyện tập mới' })).toHaveAttribute('href', '/quiz/generate');
    expect(screen.getByRole('link', { name: 'Tạo bài ôn lại chủ đề này' }))
      .toHaveAttribute('href', '/quiz/generate?q=C%C3%A1ch%20m%E1%BA%A1ng%20th%C3%A1ng%20T%C3%A1m');
    expect(screen.getAllByRole('link', { name: /Xem lịch sử/ }).every((link) => link.getAttribute('href') === '/quiz/history')).toBe(true);
    expect(container.querySelector('.public-page-back-row')).not.toBeInTheDocument();
  });

  it('scrolls the application scroll container to the top', async () => {
    const appScrollRoot = document.createElement('div');
    appScrollRoot.id = 'app-scroll-root';
    appScrollRoot.scrollTo = vi.fn();
    document.body.appendChild(appScrollRoot);

    render(
      <MemoryRouter initialEntries={['/quiz/result/session-1']}>
        <Routes>
          <Route path="/quiz/result/:sessionId" element={<QuizResultPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Lên đầu trang' }));
    expect(appScrollRoot.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'smooth' });
    appScrollRoot.remove();
  });
});
