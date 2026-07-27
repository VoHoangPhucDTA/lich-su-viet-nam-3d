import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/auth';
import ExamHomePage from '../ExamHomePage';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';

const testState = vi.hoisted(() => ({
  currentUser: null as User | null,
  getDashboardAnalytics: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ currentUser: testState.currentUser }),
}));

vi.mock('@/services/dashboardAnalyticsApi', () => ({
  getDashboardAnalytics: testState.getDashboardAnalytics,
}));

function renderExamHome() {
  const router = createMemoryRouter(
    [
      { path: '/exams', element: <ExamHomePage /> },
      { path: PERSONAL_LEARNING_DASHBOARD_ROUTE, element: <h1>Dashboard destination</h1> },
    ],
    { initialEntries: ['/exams'] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe('ExamHome dashboard entry', () => {
  beforeEach(() => {
    testState.currentUser = null;
    testState.getDashboardAnalytics.mockReset();
  });

  it('shows the public entry without requesting analytics', () => {
    renderExamHome();

    const link = screen.getByRole('link', { name: 'Xem thống kê học tập' });
    expect(link).toHaveAttribute('href', PERSONAL_LEARNING_DASHBOARD_ROUTE);
    expect(screen.getByText('Thống kê học tập')).toBeInTheDocument();
    expect(testState.getDashboardAnalytics).not.toHaveBeenCalled();
  });

  it('also shows the entry to an authenticated user', () => {
    testState.currentUser = {
      id: 'student-1',
      fullName: 'Nguyễn An',
      email: 'an@example.test',
      role: 'student',
    };

    renderExamHome();

    expect(screen.getByRole('link', { name: 'Xem thống kê học tập' })).toBeInTheDocument();
    expect(testState.getDashboardAnalytics).not.toHaveBeenCalled();
  });

  it('navigates normally and browser Back returns to the exam home', async () => {
    const user = userEvent.setup();
    const router = renderExamHome();

    await user.click(screen.getByRole('link', { name: 'Xem thống kê học tập' }));
    expect(router.state.location.pathname).toBe(PERSONAL_LEARNING_DASHBOARD_ROUTE);

    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/exams');
  });
});
