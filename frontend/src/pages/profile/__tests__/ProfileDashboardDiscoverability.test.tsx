import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileDashboardPage from '../ProfileDashboardPage';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';

const getDashboardAnalytics = vi.hoisted(() => vi.fn());
const usePersonalLearningDashboard = vi.hoisted(() => vi.fn());
const renderPersonalLearningDashboard = vi.hoisted(() => vi.fn());

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

vi.mock('@/services/dashboardAnalyticsApi', () => ({
  getDashboardAnalytics,
}));

vi.mock('@/features/dashboard/usePersonalLearningDashboard', () => ({
  usePersonalLearningDashboard,
}));

vi.mock('@/features/dashboard/PersonalLearningDashboardPage', () => ({
  default: () => {
    renderPersonalLearningDashboard();
    return null;
  },
}));

describe('ProfileDashboard analytics discoverability', () => {
  beforeEach(() => {
    getDashboardAnalytics.mockReset();
    usePersonalLearningDashboard.mockReset();
    renderPersonalLearningDashboard.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places the link-only analytics card after the welcome hero without fetching data', () => {
    const localStorageRead = vi.spyOn(Storage.prototype, 'getItem');

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
    expect(usePersonalLearningDashboard).not.toHaveBeenCalled();
    expect(renderPersonalLearningDashboard).not.toHaveBeenCalled();
    expect(localStorageRead).not.toHaveBeenCalled();
  });

  it('removes duplicated exam analytics from the profile render tree', () => {
    render(
      <MemoryRouter initialEntries={['/profile/dashboard']}>
        <ProfileDashboardPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('heading', { name: 'Điểm theo tuần' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tỉ lệ đúng theo chủ đề' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chủ đề làm tốt nhất' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chủ đề cần ôn luyện' })).not.toBeInTheDocument();
    expect(screen.queryByText('Điểm TB')).not.toBeInTheDocument();
    expect(screen.queryByText(/Điểm chủ đề/)).not.toBeInTheDocument();
    expect(screen.queryByText(/đạt điểm TB/)).not.toBeInTheDocument();
  });

  it('keeps the general overview, grade progress, continuation and recommendations accessible', () => {
    render(
      <MemoryRouter initialEntries={['/profile/dashboard']}>
        <ProfileDashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Xin chào, An!' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem thống kê luyện thi' })).toHaveAttribute(
      'href',
      PERSONAL_LEARNING_DASHBOARD_ROUTE,
    );
    expect(screen.getByLabelText('Tổng quan học tập chung')).toBeInTheDocument();
    expect(screen.getByText('Sự kiện')).toBeInTheDocument();
    expect(screen.getByText('Trắc nghiệm')).toBeInTheDocument();
    expect(screen.getByText('Chuỗi học')).toBeInTheDocument();
    expect(screen.getByText('Tuần này')).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 2, name: 'Tiến độ theo lớp' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Tiến độ lớp 10/ })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Tiến độ lớp 11/ })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Tiến độ lớp 12/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Tiếp tục học' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ôn lại' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tiếp tục' })).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: 'Gợi ý học tập' })).toBeInTheDocument();
    expect(screen.getByRole('heading', {
      level: 3,
      name: 'Thử thách: Trắc nghiệm kiến thức tổng hợp',
    })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/profile/dashboard');
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });
});
