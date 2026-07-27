import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import defaultFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-default.json';
import type { DashboardAnalyticsResponseV1 } from '@/features/dashboard/dashboardAnalyticsTypes';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';
import type { ProfileLearningSummaryV1 } from '@/services/profileLearningSummaryApi';
import ProfileDashboardPage from '../ProfileDashboardPage';

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

const summary: ProfileLearningSummaryV1 = {
  schemaVersion: 1,
  generatedAt: '2026-07-27T03:00:00Z',
  timezone: 'Asia/Ho_Chi_Minh',
  eventsViewed: 12,
  quizzesCompleted: 4,
  totalMinutes: 61,
  streakDays: 3,
};

const dashboard = {
  ...(defaultFixture as unknown as DashboardAnalyticsResponseV1),
  recentAttempts: [{
    attemptId: 'attempt-1',
    title: 'Đề thi thử Lịch sử số 1',
    mode: 'TIMED_ORIGINAL',
    score: 8.25,
    durationSeconds: 1_800,
    submittedAt: '2026-07-26T03:00:00Z',
    totalQuestions: 40,
    detailStatus: 'full',
    scoreAuthority: 'BACKEND',
    timingAuthority: 'SERVER',
    submissionOrigin: 'SERVER_ON_TIME',
  }],
} satisfies DashboardAnalyticsResponseV1;

describe('ProfileDashboard real-data overview', () => {
  const requestSummary = vi.fn();
  const requestDashboard = vi.fn();

  beforeEach(() => {
    requestSummary.mockReset().mockResolvedValue(summary);
    requestDashboard.mockReset().mockResolvedValue(dashboard);
  });

  it('loads four truthful KPIs and recent attempts from backend contracts', async () => {
    render(
      <MemoryRouter initialEntries={['/profile/dashboard']}>
        <ProfileDashboardPage
          requestSummary={requestSummary}
          requestDashboard={requestDashboard}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Xin chào, An!' })).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('61 phút')).toBeInTheDocument();
    expect(screen.getByText('3 ngày')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Đề thi thử Lịch sử số 1/ })).toHaveAttribute(
      'href',
      '/exams/ket-qua/attempt-1',
    );
    expect(requestSummary).toHaveBeenCalledTimes(1);
    expect(requestDashboard).toHaveBeenCalledWith('30d', expect.any(AbortSignal));
  });

  it('removes unsupported rank, grade progress and mocked continuation sections', async () => {
    render(
      <MemoryRouter>
        <ProfileDashboardPage
          requestSummary={requestSummary}
          requestDashboard={requestDashboard}
        />
      </MemoryRouter>,
    );

    await screen.findByText('61 phút');
    expect(screen.queryByText(/Top \d+%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tiến độ theo lớp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tiếp tục học' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gợi ý học tập' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bài thi gần đây' })).toBeInTheDocument();
  });

  it('keeps real analytics and history discoverable from profile navigation', async () => {
    render(
      <MemoryRouter>
        <ProfileDashboardPage
          requestSummary={requestSummary}
          requestDashboard={requestDashboard}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Xem thống kê luyện thi' })).toHaveAttribute(
      'href',
      PERSONAL_LEARNING_DASHBOARD_ROUTE,
    );
    expect(screen.getByRole('link', { name: 'Lịch sử học tập' })).toHaveAttribute(
      'href',
      '/exams/lich-su',
    );
    expect(screen.getByRole('link', { name: 'Điểm số & phân tích' })).toHaveAttribute(
      'href',
      '/exams/thong-ke',
    );
  });

  it('shows a retry action when the KPI endpoint fails', async () => {
    const user = userEvent.setup();
    requestSummary
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(summary);

    render(
      <MemoryRouter>
        <ProfileDashboardPage
          requestSummary={requestSummary}
          requestDashboard={requestDashboard}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải các chỉ số học tập');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(requestSummary).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('61 phút')).toBeInTheDocument();
  });
});
