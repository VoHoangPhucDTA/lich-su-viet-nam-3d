import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileDashboardPage from '../ProfileDashboardPage';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';

const getDashboardAnalytics = vi.hoisted(() => vi.fn());

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      id: 'student-1',
      fullName: 'Nguyễn An',
      email: 'an@example.test',
      role: 'student',
    },
    logout: vi.fn(),
  }),
}));

vi.mock('@/components/profile/StatsCard', () => ({
  default: () => null,
}));

vi.mock('@/components/profile/RecommendationCard', () => ({
  default: () => null,
}));

vi.mock('@/components/profile/ProgressChart', () => ({
  WeeklyScoreChart: () => null,
  CategoryChart: () => null,
  GradeProgressChart: () => null,
}));

vi.mock('@/services/dashboardAnalyticsApi', () => ({
  getDashboardAnalytics,
}));

describe('ProfileDashboard analytics discoverability', () => {
  beforeEach(() => {
    getDashboardAnalytics.mockReset();
  });

  it('places the link-only analytics card after the welcome hero without fetching data', () => {
    render(
      <MemoryRouter initialEntries={['/profile/dashboard']}>
        <ProfileDashboardPage />
      </MemoryRouter>,
    );

    const welcome = screen.getByRole('heading', { level: 1 });
    const link = screen.getByRole('link', { name: 'Xem thống kê luyện thi' });
    const profileMain = link.closest('main');

    expect(link).toHaveAttribute('href', PERSONAL_LEARNING_DASHBOARD_ROUTE);
    expect(welcome.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(profileMain).toHaveClass('overflow-y-auto');
    expect(link).not.toHaveClass('overflow-y-auto');
    expect(getDashboardAnalytics).not.toHaveBeenCalled();
  });
});
