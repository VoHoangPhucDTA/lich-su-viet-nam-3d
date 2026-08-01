import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuizSessionPage from '../QuizSessionPage';
import type { QuizSession } from '@/types/quiz';

const mocks = vi.hoisted(() => ({
  getQuizSession: vi.fn(),
  saveQuizProgress: vi.fn(),
  submitQuiz: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'user-1' } }),
}));

vi.mock('@/services/quizService', () => ({
  getQuizSession: mocks.getQuizSession,
  saveQuizProgress: mocks.saveQuizProgress,
  submitQuiz: mocks.submitQuiz,
}));

function makeSession(startedAt = new Date().toISOString()): QuizSession {
  const questions = [1, 2].map((number) => ({
    id: `q-${number}`,
    questionText: `Nội dung câu ${number}`,
    options: [
      { id: 'A' as const, text: 'Phương án A' },
      { id: 'B' as const, text: 'Phương án B' },
      { id: 'C' as const, text: 'Phương án C' },
      { id: 'D' as const, text: 'Phương án D' },
    ],
    correctOptionId: 'A' as const,
    explanation: 'Chỉ hiện sau khi nộp',
    difficulty: 'medium' as const,
    grade: 12 as const,
    topic: 'Cách mạng tháng Tám',
    sourceRefs: [{ title: 'SGK Lịch sử 12', location: 'Bài 6' }],
    generatedBy: 'rag' as const,
  }));
  return {
    sessionId: 'session-1',
    config: { query: 'Cách mạng tháng Tám', questionCount: 2, difficulty: 'medium', timeLimitMinutes: 5 },
    questions,
    answers: questions.map((question) => ({ questionId: question.id, selectedOptionId: null })),
    questionStatuses: { 'q-1': 'unanswered', 'q-2': 'unanswered' },
    startedAt,
    submittedAt: null,
    currentQuestionIndex: 0,
    userId: 'user-1',
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/quiz/session/session-1']}>
      <Routes>
        <Route path="/quiz/session/:sessionId" element={<QuizSessionPage />} />
        <Route path="/quiz/result/:sessionId" element={<p>Kết quả đã sẵn sàng</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuizSessionPage', () => {
  beforeEach(() => {
    mocks.getQuizSession.mockReset();
    mocks.saveQuizProgress.mockReset();
    mocks.submitQuiz.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('persists options, focuses navigated questions, hides sources before submit and confirms unanswered submission once', async () => {
    mocks.getQuizSession.mockResolvedValue(makeSession());
    mocks.submitQuiz.mockResolvedValue({});
    const alertSpy = vi.spyOn(window, 'alert');
    renderPage();

    const firstQuestion = await screen.findByText('Nội dung câu 1');
    expect(firstQuestion).toBeInTheDocument();
    expect(screen.queryByText('Chỉ hiện sau khi nộp')).not.toBeInTheDocument();
    expect(screen.queryByText('SGK Lịch sử 12')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Phương án A/ }));
    expect(mocks.saveQuizProgress).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /câu tiếp/i }));
    await screen.findByText('Nội dung câu 2');
    expect(document.querySelector('[data-quiz-current-question]')).toHaveFocus();
    const submitButtons = screen.getAllByRole('button', { name: /^nộp bài$/i });
    expect(submitButtons).toHaveLength(2);
    fireEvent.click(submitButtons[submitButtons.length - 1]);
    expect(await screen.findByRole('dialog', { name: /xác nhận nộp bài/i })).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /xác nhận nộp/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.submitQuiz).toHaveBeenCalledOnce());
    expect(await screen.findByText('Kết quả đã sẵn sàng')).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('submits time-up once, keeps answers locked, and offers inline retry after failure', async () => {
    mocks.getQuizSession.mockResolvedValue(makeSession(new Date(Date.now() - 6 * 60_000).toISOString()));
    mocks.submitQuiz.mockRejectedValue(new Error('offline'));
    const alertSpy = vi.spyOn(window, 'alert');
    renderPage();

    expect(await screen.findByText('Không thể nộp bài lúc này. Bài làm của bạn vẫn được giữ lại.')).toBeInTheDocument();
    await waitFor(() => expect(mocks.submitQuiz).toHaveBeenCalledOnce());
    expect(screen.getAllByRole('radio')[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thử nộp lại' })).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('keeps desktop progress, exposes mobile progress, and opens instructions from button or shortcut', async () => {
    mocks.getQuizSession.mockResolvedValue(makeSession());
    renderPage();
    await screen.findByText('Nội dung câu 1');

    expect(document.querySelector('.quiz-progress-desktop')).toBeInTheDocument();
    const progressTrigger = screen.getByRole('button', { name: 'Tiến trình' });
    expect(progressTrigger).toHaveClass('quiz-progress-toggle');
    fireEvent.click(progressTrigger);
    expect(screen.getAllByRole('button', { name: 'Đóng tiến trình' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Đóng tiến trình' })[0]);

    fireEvent.keyDown(document, { key: '2' });
    expect(mocks.saveQuizProgress).toHaveBeenCalledWith(expect.objectContaining({
      answers: expect.arrayContaining([expect.objectContaining({ questionId: 'q-1', selectedOptionId: 'B' })]),
    }));
    fireEvent.keyDown(document, { key: 'c' });
    expect(mocks.saveQuizProgress).toHaveBeenCalledWith(expect.objectContaining({
      answers: expect.arrayContaining([expect.objectContaining({ questionId: 'q-1', selectedOptionId: 'C' })]),
    }));
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(mocks.saveQuizProgress).toHaveBeenCalledWith(expect.objectContaining({
      answers: expect.arrayContaining([expect.objectContaining({ questionId: 'q-1', selectedOptionId: 'D' })]),
    }));
    fireEvent.keyDown(document, { key: 'Home' });
    expect(mocks.saveQuizProgress).toHaveBeenCalledWith(expect.objectContaining({
      answers: expect.arrayContaining([expect.objectContaining({ questionId: 'q-1', selectedOptionId: 'A' })]),
    }));
    fireEvent.keyDown(document, { key: 'Delete' });
    expect(mocks.saveQuizProgress).toHaveBeenCalledWith(expect.objectContaining({
      answers: expect.arrayContaining([expect.objectContaining({ questionId: 'q-1', selectedOptionId: null })]),
    }));

    const instructions = screen.getByRole('button', { name: 'Hướng dẫn' });
    fireEvent.click(instructions);
    expect(await screen.findByRole('dialog', { name: 'Hướng dẫn làm bài' })).toBeInTheDocument();
    expect(screen.getByText('Chọn nhanh phương án A–D')).toBeInTheDocument();
    expect(screen.getByText('Mở xác nhận nộp bài')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(instructions).toHaveFocus();

    fireEvent.keyDown(document, { key: '?' });
    expect(await screen.findByRole('dialog', { name: 'Hướng dẫn làm bài' })).toBeInTheDocument();
  });

  it('opens the submit confirmation with Ctrl+Enter', async () => {
    mocks.getQuizSession.mockResolvedValue(makeSession());
    renderPage();
    await screen.findByText('Nội dung câu 1');

    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });

    expect(await screen.findByRole('dialog', { name: /xác nhận nộp bài/i })).toBeInTheDocument();
  });
});
