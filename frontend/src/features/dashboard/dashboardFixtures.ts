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
): PersonalLearningDashboardViewModel {
  return {
    state,
    scope: {
      source: 'backend',
      range,
      timezone: 'Asia/Ho_Chi_Minh',
      isAuthenticated: false,
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
