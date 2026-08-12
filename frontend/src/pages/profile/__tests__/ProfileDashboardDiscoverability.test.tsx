import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import defaultFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-default.json';
import type {
  DashboardAnalyticsResponseV1,
  DashboardRecentAttemptV1,
} from '@/features/dashboard/dashboardAnalyticsTypes';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';
import type { DashboardAnalyticsRequest } from '@/services/dashboardAnalyticsApi';
import type {
  ProfileLearningSummaryRequest,
  ProfileLearningSummaryV1,
} from '@/services/profileLearningSummaryApi';
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

function createAttempt(index: number, score: number): DashboardRecentAttemptV1 {
  return {
    attemptId: `attempt-${index}`,
    title: `Đề thi thử Lịch sử số ${index}`,
    mode: 'TIMED_ORIGINAL',
    score,
    durationSeconds: 1_800,
    submittedAt: `2026-07-${String(27 - index).padStart(2, '0')}T03:00:00Z`,
    totalQuestions: 40,
    detailStatus: 'full',
    scoreAuthority: 'BACKEND',
    timingAuthority: 'SERVER',
    submissionOrigin: 'SERVER_ON_TIME',
  };
}

const dashboard = {
  ...(defaultFixture as unknown as DashboardAnalyticsResponseV1),
  recentAttempts: [
    createAttempt(1, 8.25),
    createAttempt(2, 7.5),
    createAttempt(3, 9),
    createAttempt(4, 6.75),
    createAttempt(5, 8),
  ],
} satisfies DashboardAnalyticsResponseV1;

function renderDashboard(
  requestSummary: ProfileLearningSummaryRequest,
  requestDashboard: DashboardAnalyticsRequest,
) {
  return render(
    <MemoryRouter initialEntries={['/profile/dashboard']}>
      <ProfileDashboardPage
        requestSummary={requestSummary}
        requestDashboard={requestDashboard}
      />
    </MemoryRouter>,
  );
}

function getRecentAttemptsSection(): HTMLElement {
  const section = screen.getByRole('heading', { name: 'Bài thi gần đây' }).closest('section');
  expect(section).not.toBeNull();
  return section!;
}

describe('ProfileDashboard real-data overview', () => {
  const requestSummary = vi.fn<ProfileLearningSummaryRequest>();
  const requestDashboard = vi.fn<DashboardAnalyticsRequest>();

  beforeEach(() => {
    requestSummary.mockReset().mockResolvedValue(summary);
    requestDashboard.mockReset().mockResolvedValue(dashboard);
  });

  it('loads the four truthful KPI definitions from the existing summary contract', async () => {
    renderDashboard(requestSummary, requestDashboard);

    expect(screen.queryByText('Tổng quan học tập')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Xin chào, An!' })).toBeInTheDocument();
    expect(screen.queryByText('Tiếp tục hành trình khám phá lịch sử hôm nay.')).not.toBeInTheDocument();

    await screen.findByText('Sự kiện đã xem');
    const kpis = screen.getByRole('region', { name: 'Chỉ số học tập' });
    expect(within(kpis).getByText('Sự kiện đã xem')).toBeInTheDocument();
    expect(within(kpis).getByText('Quiz AI hoàn thành')).toBeInTheDocument();
    expect(within(kpis).getByText('Chuỗi hiện tại')).toBeInTheDocument();
    expect(within(kpis).getByText('Thời gian luyện thi')).toBeInTheDocument();
    expect(within(kpis).getByText('12')).toBeInTheDocument();
    expect(within(kpis).getByText('4')).toBeInTheDocument();
    expect(within(kpis).getByText('3 ngày')).toBeInTheDocument();
    expect(within(kpis).getByText('61 phút')).toBeInTheDocument();
    const decorativeIcons = kpis.querySelectorAll('.profile-kpi-icon');
    expect(decorativeIcons).toHaveLength(4);
    decorativeIcons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
    expect(kpis.querySelectorAll('.profile-kpi-icon svg')).toHaveLength(4);
    expect(requestSummary).toHaveBeenCalledTimes(1);
    expect(requestDashboard).toHaveBeenCalledWith('30d', expect.any(AbortSignal));
  });

  it('keeps analytics, recent exam history and next actions discoverable through truthful CTAs', async () => {
    renderDashboard(requestSummary, requestDashboard);

    expect(await screen.findByRole('link', { name: 'Xem phân tích luyện thi' })).toHaveAttribute(
      'href',
      PERSONAL_LEARNING_DASHBOARD_ROUTE,
    );

    const recent = getRecentAttemptsSection();
    expect(within(recent).getByText('Trong 30 ngày qua')).toBeInTheDocument();
    expect(within(recent).getAllByRole('link', { name: /Đề thi thử Lịch sử số/i })).toHaveLength(3);
    expect(within(recent).getByRole('link', { name: /Đề thi thử Lịch sử số 1/i })).toHaveAttribute(
      'href',
      '/exams/ket-qua/attempt-1',
    );
    expect(within(recent).getByText('8,25/10')).toBeInTheDocument();
    expect(within(recent).queryByText(/Đề thi thử Lịch sử số 4/i)).not.toBeInTheDocument();
    expect(within(recent).queryByText(/Đề thi thử Lịch sử số 5/i)).not.toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: /Xem toàn bộ lịch sử thi/ })).toHaveAttribute(
      'href',
      '/exams/lich-su',
    );

    expect(screen.getByRole('link', { name: /^Làm đề THPT/ })).toHaveAttribute(
      'href',
      '/exams/browse',
    );
    expect(screen.getByRole('link', { name: /^Trắc nghiệm AI/ })).toHaveAttribute(
      'href',
      '/quiz/generate',
    );
  });

  it('shows separate accessible loading states for KPIs and recent attempts', () => {
    requestSummary.mockReturnValue(new Promise(() => undefined));
    requestDashboard.mockReturnValue(new Promise(() => undefined));

    renderDashboard(requestSummary, requestDashboard);

    const kpis = screen.getByRole('region', { name: 'Chỉ số học tập' });
    expect(within(kpis).getByRole('status')).toBeInTheDocument();
    expect(within(getRecentAttemptsSection()).getByRole('status')).toBeInTheDocument();
  });

  it('explains the 30-day empty state and offers the existing exam browse route', async () => {
    requestDashboard.mockResolvedValue({
      ...dashboard,
      recentAttempts: [],
    } satisfies DashboardAnalyticsResponseV1);

    renderDashboard(requestSummary, requestDashboard);

    const recent = getRecentAttemptsSection();
    expect(await within(recent).findByText(/chưa có bài thi.*30 ngày qua/i)).toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: /chọn đề|làm đề/i })).toHaveAttribute(
      'href',
      '/exams/browse',
    );
  });

  it('shows a local KPI error and retries through the existing reload flow', async () => {
    const user = userEvent.setup();
    requestSummary
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(summary);

    renderDashboard(requestSummary, requestDashboard);

    const kpis = screen.getByRole('region', { name: 'Chỉ số học tập' });
    const alert = await within(kpis).findByRole('alert');
    expect(alert).toHaveTextContent(/chưa thể tải.*chỉ số học tập/i);
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(requestSummary).toHaveBeenCalledTimes(2));
    expect(await within(kpis).findByText('61 phút')).toBeInTheDocument();
  });

  it('shows a local recent-attempt error and retries without changing its API range', async () => {
    const user = userEvent.setup();
    requestDashboard
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(dashboard);

    renderDashboard(requestSummary, requestDashboard);

    const recent = getRecentAttemptsSection();
    const alert = await within(recent).findByRole('alert');
    expect(alert).toHaveTextContent(/không thể tải|chưa thể tải/i);
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(requestDashboard).toHaveBeenCalledTimes(2));
    expect(requestDashboard).toHaveBeenLastCalledWith('30d', expect.any(AbortSignal));
    expect(await within(recent).findByRole('link', { name: /Đề thi thử Lịch sử số 1/i })).toBeInTheDocument();
  });
});
