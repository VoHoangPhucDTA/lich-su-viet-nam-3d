import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { dashboardAiPracticeRoute } from '../dashboardRecommendation';
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
const fixedNow = () => new Date('2026-07-24T05:00:00.000Z');

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
  it('renders the default dashboard with the exact KPI set, recommendation, focus topics, and two closed disclosures', () => {
    const { container } = renderFixture('default');

    for (const label of ['Số bài đã làm', 'Điểm trung bình', 'Điểm cao nhất', 'Điểm gần nhất']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('Ngày hoạt động', { selector: '.dashboard-kpi-card p' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Các chủ đề khác cần chú ý' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Các chủ đề cần tập trung' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lịch sử luyện thi' })).toBeInTheDocument();
    // Phase G: insights được tách sang disclosure "Xem tất cả chủ đề" (mặc định đóng);
    // cognitive / question-type / coverage nằm trong disclosure "Phân tích chi tiết".
    const topicsDisclosure = container.querySelector('.dashboard-topics-disclosure');
    const advancedDisclosure = container.querySelector('.dashboard-advanced-disclosure');
    expect(topicsDisclosure).toBeInTheDocument();
    expect(topicsDisclosure).not.toHaveAttribute('open');
    expect(topicsDisclosure?.querySelector('summary')).toHaveTextContent('Xem tất cả chủ đề');
    expect(advancedDisclosure).toBeInTheDocument();
    expect(advancedDisclosure).not.toHaveAttribute('open');
    expect(advancedDisclosure?.querySelector('summary')).toHaveTextContent('Phân tích chi tiết');
    const topicsBody = topicsDisclosure?.querySelector('.dashboard-advanced-disclosure-body') as HTMLElement | null;
    const advancedBody = advancedDisclosure?.querySelector('.dashboard-advanced-disclosure-body') as HTMLElement | null;
    expect(topicsBody).not.toBeNull();
    expect(advancedBody).not.toBeNull();
    expect(topicsBody?.querySelector('#dashboard-insight-title')).not.toBeVisible();
    expect(advancedBody?.querySelector('#dashboard-question-type-title')).not.toBeVisible();
    // Phase J2: Cognitive không render trên Analytics.
    expect(advancedBody?.querySelector('#dashboard-cognitive-title')).toBeNull();
    // Phase J: Coverage không render trên Analytics (kể cả trong disclosure).
    expect(advancedBody?.querySelector('#dashboard-coverage-title')).toBeNull();
    // Insights chỉ nằm trong "Xem tất cả chủ đề", không trong "Phân tích chi tiết".
    expect(advancedBody?.querySelector('#dashboard-insight-title')).toBeNull();
    // Phase I: RecentAttempts/QuickActions đã bỏ hoàn toàn khỏi Analytics rendering.
    expect(screen.queryByRole('link', { name: /^Xem lại bài làm:/ })).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-main-column > .dashboard-history')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-quick-actions')).not.toBeInTheDocument();
    // Hành vi disclosure: mặc định đóng, có thể mở bằng bàn phím/chuột.
    fireEvent.click(advancedDisclosure!.querySelector('summary') as HTMLElement);
    expect(advancedDisclosure).toHaveAttribute('open');
    expect(advancedBody?.querySelector('#dashboard-question-type-title')).toBeVisible();
    fireEvent.click(topicsDisclosure!.querySelector('summary') as HTMLElement);
    expect(topicsDisclosure).toHaveAttribute('open');
    expect(topicsBody?.querySelector('#dashboard-insight-title')).toBeVisible();
    // TASK-02: notice phụ (partial-detail) không còn bị lọc bỏ khỏi UI — hành vi cũ giấu hẳn
    // thông tin phạm vi dữ liệu. Hành vi đúng mới: notice nằm trong <details> "Chi tiết về
    // nguồn dữ liệu", không chiếm chỗ banner primary phía trên nội dung chính.
    expect(container.querySelector('.dashboard-content > .dashboard-notice-stack')).toBeNull();
    const noticeDetails = container.querySelector('.dashboard-notice-details');
    expect(noticeDetails).toHaveTextContent('Chi tiết về nguồn dữ liệu (1)');
    const secondaryNotice = noticeDetails?.querySelector('.dashboard-notice') as HTMLElement;
    expect(secondaryNotice).toHaveTextContent('Phân tích chưa bao phủ toàn bộ lịch sử');
    expect(secondaryNotice).not.toBeVisible();
    fireEvent.click(noticeDetails!.querySelector('summary') as HTMLElement);
    expect(secondaryNotice).toBeVisible();
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
    const { container } = renderFixture('error');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải thống kê học tập');
    expect(screen.getAllByRole('heading', { name: 'Không thể tải thống kê học tập' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thống kê học tập');
    expect(await screen.findByText('Số bài đã làm')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.dashboard-focus-target')).toHaveFocus());
  });

  it('exposes one polite atomic live region', () => {
    const { container } = renderFixture('default');
    const live = container.querySelector('[aria-live]');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('aria-atomic', 'true');
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
    const { container } = renderFixture('partial-details');
    expect(screen.getByText(DASHBOARD_FIXTURES['partial-details'].notices[0].title)).toBeInTheDocument();
    expect(screen.getByText(/Chỉ 4\/9 bài có dữ liệu chi tiết/)).toBeInTheDocument();
    // Task H: coverage card và question-type nằm trong "Phân tích chi tiết" disclosure, không hiển thị ở default view.
    expect(document.querySelector('.dashboard-main-column > .dashboard-coverage')).not.toBeInTheDocument();
    const questionTypeHeading = container.querySelector('#dashboard-question-type-title') as HTMLElement | null;
    expect(questionTypeHeading).not.toBeNull();
    expect(questionTypeHeading).not.toBeVisible();
  });

  it('preserves long Vietnamese content without a shortened replacement', () => {
    renderFixture('long-content');
    expect(screen.getByRole('heading', { name: DASHBOARD_FIXTURES['long-content'].recommendations[0].title })).toBeInTheDocument();
  });

  it('keeps many-attempt fixture usable while hiding the source/coverage card', () => {
    const { container } = renderFixture('many-attempts');
    // Phase I (Final visual refinement): recent attempts không còn render trên Analytics page.
    expect(screen.queryByRole('link', { name: /^Xem lại bài làm:/ })).not.toBeInTheDocument();
    // Phase J: Coverage/Source card đã bỏ khỏi Analytics rendering hoàn toàn.
    expect(container.querySelector('.dashboard-coverage')).toBeNull();
    expect(screen.queryByText('Tổng bài')).toBeNull();
    expect(screen.queryByText('Bài nguồn biểu đồ')).toBeNull();
    // TASK-02: notice vượt giới hạn fetch (partial-detail) không còn bị giấu hẳn — hành vi
    // đúng mới là nằm trong <details> phụ thay vì hiển thị như banner primary.
    expect(container.querySelector('.dashboard-content > .dashboard-notice-stack')).toBeNull();
    const noticeDetails = container.querySelector('.dashboard-notice-details');
    expect(noticeDetails).toHaveTextContent('Chi tiết về nguồn dữ liệu (1)');
    const secondaryNotice = noticeDetails?.querySelector('.dashboard-notice') as HTMLElement;
    expect(secondaryNotice).toHaveTextContent('Lịch sử vượt giới hạn hiện tại');
    expect(secondaryNotice).not.toBeVisible();
    expect(screen.queryByText('Dữ liệu xu hướng dày')).not.toBeInTheDocument();
  });

  it('opens the topics disclosure for strengths/weaknesses and the advanced disclosure for question types', () => {
    const { container } = renderFixture('default');
    // Phase G (Final visual refinement): insight được tách sang disclosure "Xem tất cả chủ đề";
    // question-type/cognitive/coverage tách sang disclosure "Phân tích chi tiết".
    const topicsDisclosure = container.querySelector('.dashboard-topics-disclosure');
    const advancedDisclosure = container.querySelector('.dashboard-advanced-disclosure');
    expect(topicsDisclosure).not.toHaveAttribute('open');
    expect(advancedDisclosure).not.toHaveAttribute('open');
    expect(container.querySelector('#dashboard-insight-title')).not.toBeVisible();
    expect(container.querySelector('#dashboard-question-type-title')).not.toBeVisible();
    // Mở "Xem tất cả chủ đề" → insight section xuất hiện.
    fireEvent.click(topicsDisclosure!.querySelector('summary') as HTMLElement);
    const insightSection = container.querySelector('.dashboard-insight-surface') as HTMLElement;
    expect(within(insightSection).getByRole('heading', { name: 'Cách mạng tháng Tám năm 1945' }).closest('li')).toHaveClass('dashboard-insight-strength');
    expect(within(insightSection).getByRole('heading', { name: 'Việt Nam từ năm 1945 đến năm 1954' }).closest('li')).toHaveClass('dashboard-insight-weakness');
    const questionTypeSection = container.querySelector('.dashboard-question-type-card') as HTMLElement;
    expect(within(questionTypeSection).getByRole('progressbar', { name: 'Độ chính xác Trắc nghiệm' })).toHaveAttribute('aria-valuenow', '77');
    expect(within(questionTypeSection).getByRole('progressbar', { name: 'Độ chính xác Đúng/Sai theo mệnh đề' })).toHaveClass('dashboard-meter-developing');
    expect(within(questionTypeSection).getByText('77/100 câu đúng · 8 câu bỏ trống')).toBeInTheDocument();
    expect(within(questionTypeSection).getByText('126/160 mệnh đề đúng · 9 bỏ trống · 7/40 câu làm dở')).toBeInTheDocument();
  });

  it('filters the recommendation topic out of focus topics and renames the heading', () => {
    const { container } = renderFixture('default');
    const recommendation = screen.getByRole('heading', { name: /Ôn lại/ });
    expect(recommendation).toBeInTheDocument();
    const focusSection = container.querySelector('.dashboard-focus-topics') as HTMLElement;
    expect(focusSection).toBeInTheDocument();
    expect(focusSection).toHaveTextContent('Các chủ đề khác cần chú ý');
    expect(focusSection).not.toHaveTextContent('Các chủ đề cần tập trung');
    expect(within(focusSection).queryByText(/^Ưu tiên [123]$/)).not.toBeInTheDocument();
    const focusLinks = within(focusSection).getAllByRole('link') as HTMLElement[];
    const recommendationTitle = recommendation.textContent ?? '';
    expect(recommendationTitle).not.toBe('');
    expect(focusLinks.some((link) => link.textContent === recommendationTitle)).toBe(false);

    const recommendationKey = DASHBOARD_FIXTURES.default.recommendations[0]?.topicKey ?? null;
    const expectedOrder = DASHBOARD_FIXTURES.default.weaknesses
      .filter((item) => item.key !== recommendationKey)
      .filter((item) => item.practiceRoute)
      .slice(0, 3)
      .map((item) => item.label);
    const actualOrder = within(focusSection).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(actualOrder).toEqual(expectedOrder);
  });

  it('hides the strength column when weaknesses are present but strengths are empty', () => {
    const model = structuredClone(DASHBOARD_FIXTURES.default);
    model.strengths = [];
    const { container } = render(
      <MemoryRouter>
        <PersonalLearningDashboardPage initialViewModel={model} />
      </MemoryRouter>,
    );
    const insightGrid = container.querySelector('.dashboard-insight-grid') as HTMLElement | null;
    expect(insightGrid).not.toBeNull();
    expect(insightGrid?.classList.contains('dashboard-two-column-single')).toBe(true);
    expect(insightGrid?.querySelector('.dashboard-insight-group-strength')).toBeNull();
    expect(insightGrid?.querySelector('.dashboard-insight-group-weakness')).not.toBeNull();
  });

  it('uses an image description instead of an indeterminate progressbar for null accuracy', () => {
    const model = structuredClone(DASHBOARD_FIXTURES.default);
    model.questionTypePerformance[0]!.accuracy = null;
    model.questionTypePerformance[0]!.totalUnits = 0;
    render(
      <MemoryRouter>
        <PersonalLearningDashboardPage initialViewModel={model} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', {
      name: 'Trắc nghiệm: chưa có đủ dữ liệu để tính độ chính xác',
    })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Độ chính xác Trắc nghiệm' })).not.toBeInTheDocument();
  });

  it('rebuilds the ready dashboard into a default narrative and two closed disclosures', () => {
    const { container } = renderFixture('default');
    // Default-visible selectors (Phase G/I Final visual refinement).
    const mainSelectors = [
      '.dashboard-recommendation',
      '.dashboard-kpi-surface',
      '.dashboard-chart-card',
      '.dashboard-focus-topics',
      '.dashboard-history-link',
    ];
    for (const selector of mainSelectors) {
      expect(container.querySelectorAll(`.dashboard-main-column > ${selector}`)).toHaveLength(1);
    }
    // Hai disclosure: "Xem tất cả chủ đề" chứa insight, "Phân tích chi tiết" chứa question-type.
    expect(container.querySelector('.dashboard-main-column > .dashboard-insight-surface')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-main-column > .dashboard-question-type-card')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-main-column > .dashboard-cognitive-card')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-main-column > .dashboard-history')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-main-column > .dashboard-coverage')).not.toBeInTheDocument();
    expect(container.querySelector('.dashboard-main-column > .dashboard-quick-actions')).not.toBeInTheDocument();
    const topicsDisclosure = container.querySelector('.dashboard-topics-disclosure');
    const advancedDisclosure = container.querySelector('.dashboard-advanced-disclosure');
    expect(topicsDisclosure).toBeInTheDocument();
    expect(advancedDisclosure).toBeInTheDocument();
    expect(topicsDisclosure).not.toHaveAttribute('open');
    expect(advancedDisclosure).not.toHaveAttribute('open');
    // Phần tử con của disclosure tồn tại trong DOM nhưng details đang đóng nên ẩn.
    expect(topicsDisclosure?.querySelector('#dashboard-insight-title')).not.toBeVisible();
    expect(advancedDisclosure?.querySelector('.dashboard-question-type-card')).not.toBeVisible();
    // Phase J: cognitive và coverage không còn render trên Analytics trong bất kỳ disclosure nào.
    expect(container.querySelector('.dashboard-cognitive-card')).toBeNull();
    expect(container.querySelector('.dashboard-coverage')).toBeNull();
    // Insight chỉ trong topicsDisclosure; question-type chỉ trong advancedDisclosure.
    expect(advancedDisclosure?.querySelector('#dashboard-insight-title')).toBeNull();
    expect(topicsDisclosure?.querySelector('.dashboard-question-type-card')).toBeNull();
    // Utility-surface rail đã được lược bỏ; assertion cũ về aside rail không còn ý nghĩa.
    expect(container.querySelector('.dashboard-utility-surface')).not.toBeInTheDocument();
    // Phase I: RecentAttempts/QuickActions không còn trên Analytics page.
    expect(screen.queryByRole('link', { name: /^Xem lại bài làm:/ })).not.toBeInTheDocument();
  });
});

describe('dashboard interactions and adapter boundaries', () => {
  it('updates the pressed time range and announces the mock-only change', () => {
    renderFixture('default');
    const sevenDays = screen.getByRole('radio', { name: '7 ngày' });
    fireEvent.click(sevenDays);
    expect(sevenDays).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Đã chuyển khoảng thời gian sang 7 ngày/)).toBeInTheDocument();
  });

  it('supports arrow-key navigation for the range radiogroup', () => {
    renderFixture('default');
    const thirtyDays = screen.getByRole('radio', { name: '30 ngày' });
    fireEvent.keyDown(thirtyDays, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '90 ngày' })).toHaveAttribute('aria-checked', 'true');
  });

  it('resolves fixture query parameters only inside the development fixture module', () => {
    expect(resolveDevelopmentDashboardFixture('?fixture=error')).toBe(DASHBOARD_FIXTURES.error);
    expect(resolveDevelopmentDashboardFixture('?fixture=not-real')).toBe(DASHBOARD_FIXTURES.default);
  });

  it('renders an anonymous sign-in state without returning a fake default fixture', async () => {
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage localStorageProvider={() => localStorageWith({})} now={fixedNow} />
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
        <PersonalLearningDashboardPage localStorageProvider={() => storage} fixtureLoader={null} now={fixedNow} />
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
        <PersonalLearningDashboardPage localStorageProvider={() => storage} fixtureLoader={null} now={fixedNow} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Phân tích cục bộ chưa đầy đủ')).toBeInTheDocument();
    expect(screen.getByText('Số bài đã làm')).toBeInTheDocument();
  });

  it('does not render a flat dashboard utility rail anymore (replaced by advanced disclosure)', () => {
    renderFixture('default');
    expect(screen.queryByRole('complementary', { name: 'Tóm tắt và hành động nhanh' })).not.toBeInTheDocument();
    expect(document.querySelector('.dashboard-utility-surface')).not.toBeInTheDocument();
    expect(document.querySelector('.dashboard-insight-grid')).not.toHaveAttribute('data-card-alignment');
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
    expect(screen.getByText('Gợi ý dựa trên kết quả thi thử gần đây.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ôn chủ đề này' })).toHaveAttribute(
      'href',
      '/exams/on-chu-de/viet-nam-1945-1954',
    );
    expect(screen.getByRole('link', { name: 'Tạo bài AI theo gợi ý' })).toHaveAttribute(
      'href',
      dashboardAiPracticeRoute('Việt Nam từ năm 1945 đến năm 1954'),
    );
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
    expect(screen.queryByRole('link', { name: 'Tạo bài AI theo gợi ý' })).not.toBeInTheDocument();
  });

  it('requests a real new range and announces the request', async () => {
    authenticate();
    let resolveAll!: (value: DashboardAnalyticsResponseV1) => void;
    const allResponse = new Promise<DashboardAnalyticsResponseV1>((resolve) => { resolveAll = resolve; });
    const requestDashboard = vi.fn()
      .mockResolvedValueOnce(readyAnalyticsResponse)
      .mockReturnValueOnce(allResponse);
    render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage requestDashboard={requestDashboard} fixtureLoader={null} />
      </MemoryRouter>,
    );
    await screen.findByText('Số bài đã làm');
    fireEvent.click(screen.getByRole('radio', { name: 'Tất cả' }));
    await waitFor(() => expect(screen.getByText('Đang tải thống kê cho khoảng Tất cả.')).toBeInTheDocument());
    await act(async () => resolveAll({
      ...readyAnalyticsResponse,
      scope: { ...readyAnalyticsResponse.scope, range: 'all', fromDate: null },
    }));
    await waitFor(() => expect(screen.getByText('Đã tải thống kê học tập từ máy chủ.')).toBeInTheDocument());
    expect(requestDashboard).toHaveBeenLastCalledWith('all', expect.any(AbortSignal));
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
    const { container } = render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage requestDashboard={requestDashboard} fixtureLoader={null} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Phiên đăng nhập đã hết hạn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute('href', '/login');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Số bài đã làm')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-focus-target')).toHaveFocus();
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
    const { container } = render(
      <MemoryRouter initialEntries={['/exams/thong-ke']}>
        <PersonalLearningDashboardPage
          requestDashboard={requestDashboard}
          fixtureLoader={null}
          localStorageProvider={() => storage}
          now={fixedNow}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Máy chủ thống kê đang tạm thời không khả dụng')).toBeInTheDocument();
    expect(screen.getByText('Có bài đang chờ đồng bộ')).toBeInTheDocument();
    const primaryNotices = container.querySelectorAll(
      '.dashboard-content > .dashboard-notice-stack > .dashboard-notice',
    );
    expect(primaryNotices).toHaveLength(1);
    expect(primaryNotices[0]).toHaveTextContent('Máy chủ thống kê đang tạm thời không khả dụng');
    const secondaryNotices = container.querySelectorAll(
      '.dashboard-notice-details .dashboard-notice',
    );
    expect(secondaryNotices).toHaveLength(2);
    expect([...secondaryNotices].map((notice) => notice.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Đang xem dữ liệu dự phòng trên thiết bị'),
      expect.stringContaining('Có bài đang chờ đồng bộ'),
    ]));
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
