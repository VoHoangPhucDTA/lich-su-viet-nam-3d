import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import QuizHistoryPage from '../QuizHistoryPage';

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'user-1' } }),
}));

vi.mock('@/services/quizService', () => ({
  getQuizHistory: vi.fn().mockResolvedValue([]),
}));

describe('QuizHistoryPage navigation', () => {
  it('returns explicitly to the quiz module home', async () => {
    render(
      <MemoryRouter initialEntries={['/unrelated', '/quiz/history']}>
        <Routes>
          <Route path="/quiz/history" element={<QuizHistoryPage />} />
          <Route path="/quiz" element={<p>Trang trắc nghiệm</p>} />
          <Route path="/unrelated" element={<p>Trang trước trong history</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Về trang trắc nghiệm' }));
    expect(screen.getByText('Trang trắc nghiệm')).toBeInTheDocument();
    expect(screen.queryByText('Trang trước trong history')).not.toBeInTheDocument();
  });
});
