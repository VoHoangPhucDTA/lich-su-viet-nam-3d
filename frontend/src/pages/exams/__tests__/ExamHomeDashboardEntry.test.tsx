import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/auth';
import ExamHomePage from '../ExamHomePage';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';

const testState = vi.hoisted(() => ({
  currentUser: null as User | null,
  isAuthenticated: false,
  isLoading: false,
  listExamAttempts: vi.fn(),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: testState.currentUser,
    isAuthenticated: testState.isAuthenticated,
    isLoading: testState.isLoading,
  }),
}));

vi.mock('@/services/examAttemptApi', () => ({
  listExamAttempts: testState.listExamAttempts,
}));

function renderExamHome() {
  const router = createMemoryRouter(
    [
      { path: '/exams', element: <ExamHomePage /> },
      { path: '/exams/browse', element: <h1>Exam bank destination</h1> },
      { path: '/exams/on-chu-de', element: <h1>Topic destination</h1> },
      { path: '/exams/tao-de', element: <h1>Custom exam destination</h1> },
      { path: '/exams/lich-su', element: <h1>History destination</h1> },
      { path: '/exams/ket-qua/:sessionId', element: <h1>Result destination</h1> },
      { path: PERSONAL_LEARNING_DASHBOARD_ROUTE, element: <h1>Analytics destination</h1> },
    ],
    { initialEntries: ['/exams'] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe('ExamHome dashboard entry', () => {
  beforeEach(() => {
    testState.currentUser = null;
    testState.isAuthenticated = false;
    testState.isLoading = false;
    testState.listExamAttempts.mockReset();
    testState.listExamAttempts.mockResolvedValue({ items: [] });
  });

  it('shows the compact hero, three practice destinations, and one history link for a guest', () => {
    renderExamHome();

    const heroTitle = screen.getByRole('heading', { name: 'Luyện đề thi THPT môn Lịch sử', level: 1 });
    const hero = heroTitle.closest('section');
    expect(hero).not.toBeNull();
    expect(within(hero as HTMLElement).queryByText('LUYỆN THI THPT')).not.toBeInTheDocument();
    expect(within(hero as HTMLElement).queryByText('Làm đề theo cấu trúc thi, ôn theo chủ đề và theo dõi quá trình cải thiện của bạn.')).not.toBeInTheDocument();
    expect(within(hero as HTMLElement).queryByRole('link')).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Ngân hàng đề', level: 3 }).closest('a')).toHaveAttribute('href', '/exams/browse');
    expect(screen.getByRole('heading', { name: 'Ôn theo chủ đề', level: 3 }).closest('a')).toHaveAttribute('href', '/exams/on-chu-de');
    expect(screen.getByRole('heading', { name: 'Tạo đề tùy chọn', level: 3 }).closest('a')).toHaveAttribute('href', '/exams/tao-de');

    const historyLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/exams/lich-su');
    expect(historyLinks).toHaveLength(1);
    expect(historyLinks[0]).toHaveAccessibleName(/Lịch sử luyện thi/);
    expect(screen.getByRole('link', { name: /Phân tích luyện thi/ })).toHaveAttribute('href', PERSONAL_LEARNING_DASHBOARD_ROUTE);
    expect(screen.getByRole('heading', { name: 'Đăng nhập để xem bài gần nhất', level: 3 })).toBeInTheDocument();
    expect(testState.listExamAttempts).not.toHaveBeenCalled();
  });

  it('requests one authenticated attempt and renders the latest result', async () => {
    testState.currentUser = {
      id: 'student-1',
      fullName: 'Nguyễn An',
      email: 'an@example.test',
      role: 'student',
    };
    testState.isAuthenticated = true;
    testState.listExamAttempts.mockResolvedValue({
      items: [
        {
          sessionId: 'session-123',
          mode: 'practice',
          title: 'Đề minh họa số 01',
          totalQuestions: 40,
          totalScore: '8.25',
          durationSeconds: 750,
          submittedAt: Date.UTC(2026, 7, 10, 1, 30),
        },
      ],
    });

    renderExamHome();

    expect(await screen.findByRole('heading', { name: 'đề minh họa số 01', level: 3 })).toBeInTheDocument();
    expect(testState.listExamAttempts).toHaveBeenCalledTimes(1);
    expect(testState.listExamAttempts).toHaveBeenCalledWith(1);
    expect(screen.getByText('8,25/10')).toBeInTheDocument();
    expect(screen.getByText('40 câu')).toBeInTheDocument();
    expect(screen.getByText('12 phút 30 giây')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem kết quả' })).toHaveAttribute('href', '/exams/ket-qua/session-123');
  });

  it('shows a light empty state when the authenticated user has no attempts', async () => {
    testState.currentUser = {
      id: 'student-1',
      fullName: 'Nguyễn An',
      email: 'an@example.test',
      role: 'student',
    };
    testState.isAuthenticated = true;

    renderExamHome();

    expect(await screen.findByRole('heading', { name: 'Bạn chưa có bài thi nào.', level: 3 })).toBeInTheDocument();
    expect(testState.listExamAttempts).toHaveBeenCalledWith(1);
    expect(screen.getByRole('link', { name: 'Vào ngân hàng đề' })).toHaveAttribute('href', '/exams/browse');
  });

  it('shows loading while the authenticated recent-attempt request is pending', () => {
    testState.currentUser = {
      id: 'student-1',
      fullName: 'Nguyễn An',
      email: 'an@example.test',
      role: 'student',
    };
    testState.isAuthenticated = true;
    testState.listExamAttempts.mockReturnValue(new Promise(() => undefined));

    renderExamHome();

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải bài gần nhất…');
    expect(testState.listExamAttempts).toHaveBeenCalledWith(1);
  });

  it('leaves loading on rejection and can retry the recent-attempt request', async () => {
    const user = userEvent.setup();
    testState.currentUser = {
      id: 'student-1',
      fullName: 'Nguyễn An',
      email: 'an@example.test',
      role: 'student',
    };
    testState.isAuthenticated = true;
    testState.listExamAttempts
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ items: [] });

    renderExamHome();

    const retryButton = await screen.findByRole('button', { name: 'Thử lại' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(retryButton);

    expect(await screen.findByRole('heading', { name: 'Bạn chưa có bài thi nào.', level: 3 })).toBeInTheDocument();
    await waitFor(() => expect(testState.listExamAttempts).toHaveBeenCalledTimes(2));
    expect(testState.listExamAttempts).toHaveBeenNthCalledWith(1, 1);
    expect(testState.listExamAttempts).toHaveBeenNthCalledWith(2, 1);
  });

  it('navigates to analytics and browser Back returns to the exam home', async () => {
    const user = userEvent.setup();
    const router = renderExamHome();

    await user.click(screen.getByRole('link', { name: /Phân tích luyện thi/ }));
    expect(router.state.location.pathname).toBe(PERSONAL_LEARNING_DASHBOARD_ROUTE);

    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/exams');
  });
});
