import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LearningAnalyticsEntryCard from '../LearningAnalyticsEntryCard';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';

const getDashboardAnalytics = vi.hoisted(() => vi.fn());

vi.mock('@/services/dashboardAnalyticsApi', () => ({
  getDashboardAnalytics,
}));

function renderCard() {
  const router = createMemoryRouter(
    [
      { path: '/profile/dashboard', element: <LearningAnalyticsEntryCard /> },
      { path: PERSONAL_LEARNING_DASHBOARD_ROUTE, element: <h1>Dashboard destination</h1> },
    ],
    { initialEntries: ['/profile/dashboard'] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe('LearningAnalyticsEntryCard', () => {
  beforeEach(() => {
    getDashboardAnalytics.mockReset();
  });

  it('is a link-only accessible card with no analytics request', () => {
    renderCard();

    const link = screen.getByRole('link', { name: 'Xem thống kê luyện thi' });
    expect(link).toHaveAttribute('href', PERSONAL_LEARNING_DASHBOARD_ROUTE);
    expect(link.querySelectorAll('a, button')).toHaveLength(0);
    expect(screen.getByText('Luyện thi THPT')).toBeInTheDocument();
    expect(screen.getByText('Thống kê luyện thi')).toBeInTheDocument();
    expect(screen.queryByText('/10')).not.toBeInTheDocument();
    expect(getDashboardAnalytics).not.toHaveBeenCalled();

    link.focus();
    expect(link).toHaveFocus();
  });

  it('activates with Enter and keeps normal Back history', async () => {
    const user = userEvent.setup();
    const router = renderCard();
    const link = screen.getByRole('link', { name: 'Xem thống kê luyện thi' });

    link.focus();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe(PERSONAL_LEARNING_DASHBOARD_ROUTE);

    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/profile/dashboard');
  });
});
