import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import defaultAnalyticsFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-default.json';
import emptyAnalyticsFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-empty.json';
import partialAnalyticsFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-partial-coverage.json';
import PersonalLearningDashboardPage from '../PersonalLearningDashboardPage';
import { DashboardAnalyticsApiError } from '@/services/dashboardAnalyticsApi';
import type { DashboardAnalyticsResponseV1 } from '../dashboardAnalyticsTypes';
import { validateDashboardAnalyticsResponseV1 } from '../dashboardAnalyticsValidation';
import { DASHBOARD_FIXTURES, resolveDevelopmentDashboardFixture } from '../dashboardDevelopmentFixtures';
import type { DashboardFixtureKey } from '../dashboardFixtures';
import type { LocalDashboardStorage } from '../localAnalytics/localDashboardRepository';
import {
  recoveryQueueItemFixture,
  v2DetailedFixture,
  v2SummaryFixture,
} from '../localAnalytics/__tests__/fixtures/localDashboardSyntheticFixtures';

const { authState } = vi.hoisted(() => ({
  authState: {
    currentUser: null as { id: string } | null,
    isAuthenticated: false,
    isLoading: false,
  },
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => authState,
}));

function validated(value: unknown): DashboardAnalyticsResponseV1 {
  const result = validateDashboardAnalyticsResponseV1(value);
  if (!result.success) throw new Error(result.issues.join(', '));
  return result.data;
}

const readyAnalyticsResponse = validated(defaultAnalyticsFixture);
const emptyAnalyticsResponse = validated(emptyAnalyticsFixture);
const partialAnalyticsResponse = validated(partialAnalyticsFixture);

function localStorageWith(entries: Record<string, unknown>): LocalDashboardStorage {
  const values = new Map(
    Object.entries(entries).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
  };
}

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
      <PersonalLearningDashboardPage initialViewModel={DASHBOARD_FIXTURES[key]} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  authState.currentUser = null;
  authState.isAuthenticated = false;
  authState.isLoading = false;
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

  it('renders error and the retry callback transitions through loading to default', async () => {
    renderFixture('error');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải thống kê học tập');
    expect(screen.getAllByRole('heading', { name: 'Không thể tải thống kê học tập' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thống kê học tập');
    expect(await screen.findByText('Số bài đã làm')).toBeInTheDocument();
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

  it('resolves fixture query parameters only inside the development fixture module', () => {
    expect(resolveDevelopmentDashboardFixture('?fixture=error')).toBe(DASHBOARD_FIXTURES.error);
    expect(resolveDevelopmentDashboardFixture('?fixture=not-real')).toBe(DASHBOARD_FIXTURES.default);
  });

  it('renders an anonymous sign-in state without returning a fake default fixture', async () => {
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage localStorageProvider={() => localStorageWith({})} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Đăng nhập để xem thống kê học tập' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText('Điểm trung bình')).not.toBeInTheDocument();
    expect(screen.queryByText(/· Máy chủ$/)).not.toBeInTheDocument();
  });

  it('renders explicit anonymous local analytics and excludes device-unscoped content', async () => {
    const storage = localStorageWith({
      'v2_result_anonymous': v2DetailedFixture({
        sessionId: 'anonymous-result',
        ownerScope: 'anonymous',
        title: 'Synthetic anonymous result',
      }),
      'v2_result_device': v2SummaryFixture({
        sessionId: 'device-result',
        title: 'Hidden device result title',
      }),
    });
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage localStorageProvider={() => storage} fixtureLoader={null} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Số bài đã làm')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu chỉ có trên thiết bị này')).toBeInTheDocument();
    expect(screen.getByText('Một số dữ liệu cũ không được tính')).toBeInTheDocument();
    expect(screen.queryByText('Hidden device result title')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
  });

  it('renders anonymous summary-only data with a partial coverage notice', async () => {
    const storage = localStorageWith({
      'v2_result_anonymous': v2SummaryFixture({
        sessionId: 'anonymous-summary',
        ownerScope: 'anonymous',
      }),
    });
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage localStorageProvider={() => storage} fixtureLoader={null} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Phân tích cục bộ chưa đầy đủ')).toBeInTheDocument();
    expect(screen.getByText('Số bài đã làm')).toBeInTheDocument();
  });

  it('keeps the utility rail in natural flow without equal-height stretch or nested scrolling', () => {
    renderFixture('default');
    const utility = screen.getByRole('complementary', { name: 'Tóm tắt và hành động nhanh' });
    expect(utility).toHaveAttribute('data-scroll-behavior', 'document-flow');
    expect(utility).toHaveAttribute('data-scroll-owner', 'app-scroll-container');
    expect(document.querySelector('.dashboard-insight-grid')).toHaveAttribute('data-card-alignment', 'start');
  });
});

describe('authenticated dashboard integration', () => {
  function authenticate() {
    authState.currentUser = { id: 'test-owner' };
    authState.isAuthenticated = true;
    authState.isLoading = false;
  }

  it('shows auth loading without requesting the backend', () => {
    authState.isLoading = true;
    const requestDashboard = vi.fn();
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage requestDashboard={requestDashboard} fixtureLoader={null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thống kê học tập');
    expect(requestDashboard).not.toHaveBeenCalled();
  });

  it('renders mapped backend data for an authenticated user', async () => {
    authenticate();
    const requestDashboard = vi.fn().mockResolvedValue(readyAnalyticsResponse);
    const localStorageProvider = vi.fn();
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage
          requestDashboard={requestDashboard}
          fixtureLoader={null}
          localStorageProvider={localStorageProvider}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Số bài đã làm')).toBeInTheDocument();
    expect(screen.getByText('4', { selector: '.dashboard-kpi-value strong' })).toBeInTheDocument();
    expect(requestDashboard).toHaveBeenCalledWith('30d', expect.any(AbortSignal));
    expect(localStorageProvider).not.toHaveBeenCalled();
  });

  it('renders authenticated empty data as an empty state', async () => {
    authenticate();
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage
          requestDashboard={vi.fn().mockResolvedValue(emptyAnalyticsResponse)}
          fixtureLoader={null}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Chưa có bài thi nào' })).toBeInTheDocument();
  });

  it('requests a real new range and announces the request', async () => {
    authenticate();
    const requestDashboard = vi.fn().mockImplementation(async (range: DashboardAnalyticsResponseV1['scope']['range']) => ({
      ...readyAnalyticsResponse,
      scope: {
        ...readyAnalyticsResponse.scope,
        range,
        fromDate: range === 'all' ? null : readyAnalyticsResponse.scope.fromDate,
      },
    }));
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage requestDashboard={requestDashboard} fixtureLoader={null} />
      </MemoryRouter>,
    );
    await screen.findByText('Số bài đã làm');
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    expect(await screen.findByText(/Đang tải thống kê cho khoảng Tất cả|Đã tải thống kê học tập từ máy chủ/)).toBeInTheDocument();
    await vi.waitFor(() => expect(requestDashboard).toHaveBeenLastCalledWith('all', expect.any(AbortSignal)));
  });

  it('shows mapper partial coverage notice without hiding data', async () => {
    authenticate();
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage
          requestDashboard={vi.fn().mockResolvedValue(partialAnalyticsResponse)}
          fixtureLoader={null}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Phân tích chưa bao phủ toàn bộ lịch sử')).toBeInTheDocument();
    expect(screen.getByText('Số bài đã làm')).toBeInTheDocument();
  });

  it('shows session expiry explicitly and retries without local fallback', async () => {
    authenticate();
    const requestDashboard = vi.fn()
      .mockRejectedValueOnce(new DashboardAnalyticsApiError('unauthenticated', 'safe', 401))
      .mockResolvedValueOnce(readyAnalyticsResponse);
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage requestDashboard={requestDashboard} fixtureLoader={null} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Phiên đăng nhập đã hết hạn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute('href', '/login');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Số bài đã làm')).toBeInTheDocument();
    expect(requestDashboard).toHaveBeenCalledTimes(2);
  });

  it('shows exact-owner local fallback, pending notice, and retries backend first', async () => {
    authenticate();
    const localResult = v2DetailedFixture({
      sessionId: 'test-owner-result',
      userId: 'test-owner',
    });
    const storage = localStorageWith({
      'v2_result_test-owner-result': localResult,
      exam_submission_recovery_queue_v1: [recoveryQueueItemFixture({
        ownerId: 'test-owner',
        localResult,
        request: {
          clientSubmissionId: 'client-test-owner',
          localSessionId: 'test-owner-result',
          mode: 'TIMED_ORIGINAL',
          datasetVersion: 'synthetic-dataset-v1',
          clientTiming: {},
          questionRefs: [],
          answers: [],
        },
      })],
    });
    const requestDashboard = vi.fn()
      .mockRejectedValueOnce(new DashboardAnalyticsApiError('server', 'safe', 503))
      .mockResolvedValueOnce(readyAnalyticsResponse);
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage
          requestDashboard={requestDashboard}
          fixtureLoader={null}
          localStorageProvider={() => storage}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Máy chủ thống kê đang tạm thời không khả dụng')).toBeInTheDocument();
    expect(screen.getByText('Có bài đang chờ đồng bộ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử kết nối máy chủ lại' })).toBeInTheDocument();
    expect(screen.queryByText('test-owner')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thử kết nối máy chủ lại' }));
    expect(await screen.findByText('4', { selector: '.dashboard-kpi-value strong' })).toBeInTheDocument();
    expect(screen.queryByText('Máy chủ thống kê đang tạm thời không khả dụng')).not.toBeInTheDocument();
    expect(requestDashboard).toHaveBeenCalledTimes(2);
  });

  it('keeps explicit DEV fixture mode isolated from HTTP', async () => {
    authenticate();
    const requestDashboard = vi.fn();
    const fixtureLoader = vi.fn().mockResolvedValue({
      resolveDevelopmentDashboardFixture: () => DASHBOARD_FIXTURES.default,
    });
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke?fixture=default']}>
        <PersonalLearningDashboardPage requestDashboard={requestDashboard} fixtureLoader={fixtureLoader} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Số bài đã làm')).toBeInTheDocument();
    expect(requestDashboard).not.toHaveBeenCalled();
  });
});
