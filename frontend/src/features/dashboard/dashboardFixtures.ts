import type { DashboardRange, PersonalLearningDashboardViewModel } from './dashboardTypes';

export const DASHBOARD_FIXTURE_KEYS = [
  'default',
  'loading',
  'error',
  'empty',
  'one-attempt',
  'anonymous',
  'backend-fallback',
  'partial-details',
  'long-content',
  'many-attempts',
] as const;

export type DashboardFixtureKey = (typeof DASHBOARD_FIXTURE_KEYS)[number];

export interface DashboardLoadResult {
  source: 'development-fixture' | 'unavailable';
  viewModel: PersonalLearningDashboardViewModel;
}

export type DashboardDevelopmentFixtureLoader = () => Promise<{
  resolveDevelopmentDashboardFixture(search: string): PersonalLearningDashboardViewModel;
}>;

export const DASHBOARD_NOT_CONNECTED_MESSAGE =
  'Dashboard Analytics API chưa được triển khai. Trang này chưa sử dụng dữ liệu học tập thật.';

const developmentFixtureLoader: DashboardDevelopmentFixtureLoader | null = import.meta.env.DEV
  ? () => import('./dashboardDevelopmentFixtures')
  : null;

function calendarDateInVietnam(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function createDashboardState(
  state: PersonalLearningDashboardViewModel['state'],
  range: DashboardRange,
  now: Date,
  isAuthenticated = false,
): PersonalLearningDashboardViewModel {
  return {
    state,
    scope: {
      source: 'backend',
      range,
      timezone: 'Asia/Ho_Chi_Minh',
      isAuthenticated,
      fromDate: null,
      toDateExclusive: calendarDateInVietnam(now),
    },
    summary: {
      totalAttempts: 0,
      averageScore: null,
      highestScore: null,
      latestScore: null,
      totalDurationSeconds: 0,
      activeDays: 0,
      mcqAccuracy: null,
      tfStatementAccuracy: null,
      blankRate: null,
      tfPartialRate: null,
    },
    recommendations: [],
    scoreTrend: {
      granularity: 'attempt',
      isComplete: false,
      sourceAttemptCount: 0,
      points: [],
    },
    strengths: [],
    weaknesses: [],
    questionTypePerformance: [],
    cognitivePerformance: [],
    recentAttempts: [],
    coverage: {
      summaryAttemptCount: 0,
      detailedAttemptCount: 0,
      totalKnownAttempts: 0,
      fetchLimit: null,
      isComplete: false,
      capturesTimedOriginal: true,
      capturesCustomMock: true,
      capturesPractice: false,
      capturesRetry: false,
      message: DASHBOARD_NOT_CONNECTED_MESSAGE,
    },
    notices: [],
  };
}

export function createDashboardLoadingViewModel(
  range: DashboardRange = '30d',
  now = new Date(),
): PersonalLearningDashboardViewModel {
  return createDashboardState('loading', range, now);
}

export function createDashboardUnavailableViewModel(
  range: DashboardRange = '30d',
  now = new Date(),
): PersonalLearningDashboardViewModel {
  const viewModel = createDashboardState('error', range, now);
  return {
    ...viewModel,
    notices: [{
      id: 'dashboard-not-connected',
      type: 'error',
      title: 'Thống kê học tập chưa được kết nối',
      message: DASHBOARD_NOT_CONNECTED_MESSAGE,
      actionLabel: null,
      actionRoute: null,
    }],
  };
}

export function createDashboardAnonymousViewModel(
  range: DashboardRange = '30d',
  now = new Date(),
): PersonalLearningDashboardViewModel {
  const viewModel = createDashboardState('empty', range, now);
  return {
    ...viewModel,
    recommendations: [{
      id: 'sign-in-dashboard',
      title: 'Đăng nhập để xem thống kê học tập',
      reason: 'Dashboard tài khoản sử dụng kết quả đã lưu trên máy chủ. Dữ liệu cục bộ chưa được tổng hợp trong phiên bản này.',
      actionLabel: 'Đăng nhập',
      actionRoute: '/login',
      priority: 'primary',
      topicKey: null,
      evidence: null,
    }],
    coverage: {
      ...viewModel.coverage,
      message: 'Cần đăng nhập để tải thống kê học tập từ máy chủ.',
    },
    notices: [{
      id: 'authentication-required',
      type: 'info',
      title: 'Đăng nhập để xem dashboard tài khoản',
      message: 'Goal 3A chưa tổng hợp dữ liệu anonymous hoặc dữ liệu lưu cục bộ.',
      actionLabel: 'Đăng nhập',
      actionRoute: '/login',
    }],
  };
}

export type DashboardErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-request'
  | 'contract'
  | 'transport'
  | 'timeout'
  | 'server'
  | 'unknown';

const DASHBOARD_ERROR_COPY: Record<DashboardErrorKind, { title: string; message: string }> = {
  unauthenticated: {
    title: 'Phiên đăng nhập đã hết hạn',
    message: 'Vui lòng đăng nhập lại để tải thống kê học tập từ máy chủ.',
  },
  forbidden: {
    title: 'Không có quyền xem thống kê',
    message: 'Tài khoản hiện tại không được phép truy cập dashboard học tập này.',
  },
  'invalid-request': {
    title: 'Khoảng thống kê không hợp lệ',
    message: 'Hãy chọn lại khoảng thời gian và thử tải dashboard.',
  },
  contract: {
    title: 'Dữ liệu thống kê không đúng định dạng',
    message: 'Máy chủ đã phản hồi nhưng dữ liệu không khớp Dashboard Analytics V1.',
  },
  transport: {
    title: 'Không thể kết nối máy chủ thống kê',
    message: 'Dữ liệu cục bộ chưa được dùng làm fallback trong Goal 3A. Hãy kiểm tra kết nối và thử lại.',
  },
  timeout: {
    title: 'Tải thống kê quá thời gian chờ',
    message: 'Máy chủ chưa phản hồi kịp. Hãy thử tải lại sau ít phút.',
  },
  server: {
    title: 'Máy chủ thống kê đang tạm gián đoạn',
    message: 'Dashboard chưa thể tải dữ liệu tài khoản. Hãy thử lại sau.',
  },
  unknown: {
    title: 'Không thể tải thống kê học tập',
    message: 'Đã xảy ra lỗi không xác định khi tải dashboard. Hãy thử lại.',
  },
};

export function createDashboardApiErrorViewModel(
  kind: DashboardErrorKind,
  range: DashboardRange = '30d',
  now = new Date(),
): PersonalLearningDashboardViewModel {
  const viewModel = createDashboardState('error', range, now, true);
  const copy = DASHBOARD_ERROR_COPY[kind];
  return {
    ...viewModel,
    coverage: { ...viewModel.coverage, message: copy.message },
    notices: [{
      id: `dashboard-${kind}`,
      type: 'error',
      title: copy.title,
      message: copy.message,
      actionLabel: kind === 'unauthenticated' ? 'Đăng nhập lại' : null,
      actionRoute: kind === 'unauthenticated' ? '/login' : null,
    }],
  };
}

export async function loadDashboardPresentationState(
  search: string,
  fixtureLoader: DashboardDevelopmentFixtureLoader | null = developmentFixtureLoader,
): Promise<DashboardLoadResult> {
  if (!fixtureLoader) {
    return {
      source: 'unavailable',
      viewModel: createDashboardUnavailableViewModel(),
    };
  }
  const fixtures = await fixtureLoader();
  return {
    source: 'development-fixture',
    viewModel: fixtures.resolveDevelopmentDashboardFixture(search),
  };
}
