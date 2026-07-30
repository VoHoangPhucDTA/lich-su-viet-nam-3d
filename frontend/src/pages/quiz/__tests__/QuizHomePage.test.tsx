import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import QuizHomePage from '../QuizHomePage';

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    currentUser: { id: 'user-1', fullName: 'Học sinh kiểm thử' },
  }),
}));

vi.mock('@/services/quizService', () => ({
  getQuizHistory: vi.fn().mockResolvedValue([]),
}));

describe('QuizHomePage navigation', () => {
  it('uses a clear, deterministic back action to the site home', async () => {
    render(
      <MemoryRouter initialEntries={['/unrelated', '/quiz']}>
        <Routes>
          <Route path="/quiz" element={<QuizHomePage />} />
          <Route path="/home" element={<p>Trang chủ</p>} />
          <Route path="/unrelated" element={<p>Trang trước trong history</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    expect(screen.queryByText('Trang trước trong history')).not.toBeInTheDocument();
  });
});
