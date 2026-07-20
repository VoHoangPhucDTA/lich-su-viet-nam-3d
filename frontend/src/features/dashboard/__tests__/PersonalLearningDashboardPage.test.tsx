import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PersonalLearningDashboardPage from '../PersonalLearningDashboardPage';
import { DASHBOARD_FIXTURES, resolveDashboardFixture, type DashboardFixtureKey } from '../dashboardFixtures';

vi.mock('recharts', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Area: () => null,
    CartesianGrid: () => null,
    ComposedChart: Wrapper,
    Line: () => null,
    ReferenceDot: () => null,
    ResponsiveContainer: Wrapper,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

function renderFixture(key: DashboardFixtureKey) {
  return render(
    <MemoryRouter initialEntries={[`/exams/thong-ke?fixture=${key}`]}>
      <PersonalLearningDashboardPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PersonalLearningDashboardPage fixtures', () => {
  it('renders the default dashboard with the exact KPI set and one question-type section', () => {
    renderFixture('default');

    for (const label of ['Số bài đã làm', 'Điểm trung bình', 'Điểm cao nhất', 'Điểm gần nhất']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('Ngày hoạt động', { selector: '.dashboard-kpi-card p' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Hiệu suất theo dạng câu' })).toHaveLength(1);
    const coveragePresentations = screen.getAllByRole('region', { name: 'Phạm vi dữ liệu' });
    expect(coveragePresentations).toHaveLength(1);
    expect(coveragePresentations[0]).toHaveClass('dashboard-coverage');
    expect(screen.queryByText('Concept C')).not.toBeInTheDocument();
  });

  it('renders a dashboard-shaped loading skeleton without fabricated KPI values', () => {
    const { container } = renderFixture('loading');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thống kê học tập');
    expect(screen.queryByText('Điểm trung bình')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-skeleton-recommendation')).toBeInTheDocument();
    expect(container.querySelectorAll('.dashboard-skeleton-card')).toHaveLength(4);
    expect(container.querySelector('.dashboard-skeleton-chart')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-skeleton-insight')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-skeleton-question')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-skeleton-history')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-skeleton-cognitive')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-skeleton-utility')).toBeInTheDocument();
  });

  it('renders error and the retry callback transitions through loading to default', () => {
    vi.useFakeTimers();
    renderFixture('error');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải thống kê học tập');
    expect(screen.getAllByRole('heading', { name: 'Không thể tải thống kê học tập' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thống kê học tập');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText('Số bài đã làm')).toBeInTheDocument();
  });

  it('renders one concise empty state with a start action', () => {
    renderFixture('empty');
    expect(screen.getAllByRole('heading', { name: 'Chưa có bài thi nào' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Làm đề ngay' })).toHaveAttribute('href', '/exams/browse');
  });

  it('renders one attempt without claiming a trend or strength', () => {
    renderFixture('one-attempt');
    expect(screen.getByText('Chưa đủ dữ liệu để nhận xét xu hướng.')).toBeInTheDocument();
    expect(screen.getByText(/Chưa đủ dữ liệu để gắn nhãn/)).toBeInTheDocument();
  });

  it('renders the anonymous device-only notice and login CTA', () => {
    renderFixture('anonymous');
    expect(screen.getAllByText('Dữ liệu chỉ lưu trên thiết bị này')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
  });

  it('keeps local data visible with a backend fallback warning', () => {
    renderFixture('backend-fallback');
    expect(screen.getByText(DASHBOARD_FIXTURES['backend-fallback'].notices[0].title)).toBeInTheDocument();
    expect(screen.getByText('Số bài đã làm')).toBeInTheDocument();
  });

  it('renders overview plus the partial-detail coverage warning', () => {
    renderFixture('partial-details');
    expect(screen.getByText(DASHBOARD_FIXTURES['partial-details'].notices[0].title)).toBeInTheDocument();
    expect(screen.getByText(/Chỉ 4\/9 bài có dữ liệu chi tiết/)).toBeInTheDocument();
    expect(document.querySelector('.dashboard-coverage')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hiệu suất theo dạng câu' })).toBeInTheDocument();
  });

  it('preserves long Vietnamese content without a shortened replacement', () => {
    renderFixture('long-content');
    expect(screen.getByRole('heading', { name: DASHBOARD_FIXTURES['long-content'].recommendations[0].title })).toBeInTheDocument();
  });

  it('distinguishes many-attempt coverage counts and limits recent history to five items', () => {
    renderFixture('many-attempts');
    expect(screen.getByText('Tổng bài').nextElementSibling).toHaveTextContent('108');
    expect(screen.getByText('Đủ dữ liệu chi tiết').nextElementSibling).toHaveTextContent('92');
    expect(screen.getByText('Bài nguồn biểu đồ').nextElementSibling).toHaveTextContent('100');
    expect(screen.getByText('Điểm trên biểu đồ').nextElementSibling).toHaveTextContent(String(DASHBOARD_FIXTURES['many-attempts'].scoreTrend.points.length));
    expect(screen.queryByText('Lịch sử vượt giới hạn hiện tại')).not.toBeInTheDocument();
    expect(screen.queryByText('Dữ liệu xu hướng dày')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Xem lại bài làm:/ })).toHaveLength(5);
  });

  it('uses semantic status classes and progress semantics for insights and question types', () => {
    renderFixture('default');
    expect(screen.getByRole('heading', { name: 'Cách mạng tháng Tám năm 1945' }).closest('li')).toHaveClass('dashboard-insight-strength');
    expect(screen.getByRole('heading', { name: 'Việt Nam từ năm 1945 đến năm 1954' }).closest('li')).toHaveClass('dashboard-insight-weakness');
    expect(screen.getByRole('progressbar', { name: 'Độ chính xác Trắc nghiệm' })).toHaveAttribute('aria-valuenow', '77');
    expect(screen.getByRole('progressbar', { name: 'Độ chính xác Đúng/Sai theo mệnh đề' })).toHaveClass('dashboard-meter-developing');
    expect(screen.getByText('77/100 câu đúng · 8 câu bỏ trống')).toBeInTheDocument();
    expect(screen.getByText('126/160 mệnh đề đúng · 9 bỏ trống · 7/40 câu làm dở')).toBeInTheDocument();
  });

  it('rebuilds the ready dashboard into a main narrative and four-card utility rail', () => {
    const { container } = renderFixture('default');
    const mainSelectors = [
      '.dashboard-recommendation',
      '.dashboard-kpi-surface',
      '.dashboard-chart-card',
      '.dashboard-insight-surface',
      '.dashboard-question-type-card',
      '.dashboard-history',
    ];
    for (const selector of mainSelectors) expect(container.querySelectorAll(`.dashboard-main-column > ${selector}`)).toHaveLength(1);
    for (const selector of ['.dashboard-activity-card', '.dashboard-cognitive-card', '.dashboard-coverage', '.dashboard-actions-card']) {
      expect(container.querySelectorAll(`.dashboard-utility-surface > ${selector}`)).toHaveLength(1);
    }
    expect(container.querySelectorAll('.dashboard-insight-group.dashboard-card')).toHaveLength(0);
    expect(container.querySelector('.dashboard-main-column .dashboard-cognitive-card')).not.toBeInTheDocument();
  });
});

describe('dashboard interactions and adapter boundaries', () => {
  it('updates the pressed time range and announces the mock-only change', () => {
    renderFixture('default');
    const sevenDays = screen.getByRole('button', { name: '7 ngày' });
    fireEvent.click(sevenDays);
    expect(sevenDays).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Đã chuyển khoảng thời gian sang 7 ngày/)).toBeInTheDocument();
  });

  it('ignores fixture query parameters outside development builds', () => {
    expect(resolveDashboardFixture('?fixture=error', false)).toBe(DASHBOARD_FIXTURES.default);
    expect(resolveDashboardFixture('?fixture=error', true)).toBe(DASHBOARD_FIXTURES.error);
    expect(resolveDashboardFixture('?fixture=not-real', true)).toBe(DASHBOARD_FIXTURES.default);
  });

  it('keeps the utility rail in natural flow without equal-height stretch or nested scrolling', () => {
    renderFixture('default');
    const utility = screen.getByRole('complementary', { name: 'Tóm tắt và hành động nhanh' });
    expect(utility).toHaveAttribute('data-scroll-behavior', 'document-flow');
    expect(utility).toHaveAttribute('data-scroll-owner', 'app-scroll-container');
    expect(document.querySelector('.dashboard-insight-grid')).toHaveAttribute('data-card-alignment', 'start');
  });
});
