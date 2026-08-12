import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizResult } from '@/types/quiz';
import QuizHistoryPage from '../QuizHistoryPage';

const mocks = vi.hoisted(() => ({
  getQuizHistory: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'user-1' } }),
}));

vi.mock('@/services/quizService', () => ({
  getQuizHistory: mocks.getQuizHistory,
}));

const historyItem: QuizResult = {
  resultId: 'result-1',
  sessionId: 'session-1',
  userId: 'user-1',
  config: { query: 'Cách mạng tháng Tám', questionCount: 5, difficulty: 'medium', timeLimitMinutes: 10 },
  totalQuestions: 5,
  correctCount: 4,
  incorrectCount: 1,
  skippedCount: 0,
  percentageScore: 80,
  score10: 8,
  totalTimeMs: 60_000,
  completedAt: '2026-08-09T08:00:00.000Z',
  questionResults: [],
  difficultyBreakdown: {
    easy: { correct: 0, total: 0 },
    medium: { correct: 4, total: 5 },
    hard: { correct: 0, total: 0 },
  },
  gradeBreakdown: { 12: { correct: 4, total: 5 } },
};

function renderPage(initialEntries = ['/quiz/history']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/quiz/history" element={<QuizHistoryPage />} />
        <Route path="/quiz" element={<p>Trang trắc nghiệm</p>} />
        <Route path="/unrelated" element={<p>Trang trước trong history</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuizHistoryPage', () => {
  beforeEach(() => {
    mocks.getQuizHistory.mockReset().mockResolvedValue([]);
  });

  it('returns explicitly to the quiz module home', async () => {
    renderPage(['/unrelated', '/quiz/history']);

    await userEvent.click(screen.getByRole('button', { name: 'Về Luyện tập với AI' }));
    expect(screen.getByText('Trang trắc nghiệm')).toBeInTheDocument();
    expect(screen.queryByText('Trang trước trong history')).not.toBeInTheDocument();
  });

  it('shows loading while the browser-local history is pending', () => {
    mocks.getQuizHistory.mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(screen.getByText('Đang tải lịch sử làm bài...')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lọc theo độ khó')).not.toBeInTheDocument();
  });

  it('shows the browser-local empty state without an inactive filter', async () => {
    renderPage();

    expect(await screen.findByText('Bạn chưa có lịch sử làm bài')).toBeInTheDocument();
    expect(screen.getByText(/được lưu trên trình duyệt này/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Lọc theo độ khó')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo bài đầu tiên' })).toHaveAttribute('href', '/quiz/generate');
  });

  it('renders saved attempts and their existing result routes', async () => {
    mocks.getQuizHistory.mockResolvedValue([historyItem]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Cách mạng tháng Tám' })).toBeInTheDocument();
    expect(screen.getByLabelText('Lọc theo độ khó')).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem lại' })).toHaveAttribute('href', '/quiz/result/session-1');
  });

  it('leaves loading after rejection and can retry', async () => {
    mocks.getQuizHistory
      .mockRejectedValueOnce(new Error('broken local data'))
      .mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa thể tải lịch sử');
    expect(screen.queryByText('Đang tải lịch sử làm bài...')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Bạn chưa có lịch sử làm bài')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getQuizHistory).toHaveBeenCalledTimes(2));
  });
});
