import type {
  DashboardAttemptAuthorityV1,
  DashboardBackendMode,
  DashboardConfidence,
  DashboardInsightStatus,
} from './dashboardAnalyticsTypes';
import type { AttemptMode } from './dashboardTypes';

export const DASHBOARD_ANALYTICS_POLICY_VERSION = 'dashboard-v1' as const;
export const DASHBOARD_ANALYTICS_MODES = ['TIMED_ORIGINAL', 'CUSTOM_MOCK'] as const;
export const DASHBOARD_MINIMUM_UNITS = 8;
export const DASHBOARD_MINIMUM_ATTEMPTS = 2;
/** Mirror của DashboardAnalyticsAggregator.TREND_LIMIT phía backend. */
export const DASHBOARD_TREND_LIMIT = 50;

export interface DashboardSample {
  accuracy: number | null;
  totalUnits: number;
  attemptCount: number;
}

export function mapDashboardBackendMode(mode: DashboardBackendMode): AttemptMode {
  return mode === 'TIMED_ORIGINAL' ? 'thi_thu' : 'custom_mock';
}

export function dashboardModeLabel(mode: DashboardBackendMode): string {
  return mode === 'TIMED_ORIGINAL' ? 'Thi thử nguyên đề' : 'Thi thử tùy chọn';
}

export function classifyDashboardInsight(sample: DashboardSample): DashboardInsightStatus {
  if (
    sample.accuracy === null
    || sample.totalUnits < DASHBOARD_MINIMUM_UNITS
    || sample.attemptCount < DASHBOARD_MINIMUM_ATTEMPTS
  ) {
    return 'insufficient-data';
  }
  if (sample.accuracy >= 80) return 'strength';
  if (sample.accuracy >= 60) return 'developing';
  return 'weakness';
}

/**
 * Phân loại khi chỉ có số ý, không có số bài riêng cho từng dạng câu.
 * Mẫu dưới ngưỡng units không được gắn nhãn điểm mạnh/yếu.
 */
export function classifyDashboardInsightByUnits(
  accuracy: number | null,
  totalUnits: number,
): DashboardInsightStatus {
  if (accuracy === null || totalUnits < DASHBOARD_MINIMUM_UNITS) return 'insufficient-data';
  if (accuracy >= 80) return 'strength';
  if (accuracy >= 60) return 'developing';
  return 'weakness';
}

export function dashboardConfidence(sample: Pick<DashboardSample, 'totalUnits' | 'attemptCount'>): DashboardConfidence {
  if (sample.totalUnits >= 30 && sample.attemptCount >= 5) return 'high';
  if (sample.totalUnits >= 16 && sample.attemptCount >= 3) return 'medium';
  return 'low';
}

type DashboardAuthorityLike = {
  scoreAuthority: string;
  timingAuthority: string;
  submissionOrigin: string;
};

export function isOfficialDashboardAttempt(authority: DashboardAuthorityLike): boolean {
  return authority.scoreAuthority === 'BACKEND'
    && authority.timingAuthority === 'SERVER'
    && authority.submissionOrigin === 'SERVER_ON_TIME';
}

export function isRecoveredDashboardAttempt(authority: DashboardAuthorityLike): boolean {
  return authority.scoreAuthority === 'BACKEND'
    && authority.timingAuthority === 'CLIENT_UNVERIFIED'
    && (
      authority.submissionOrigin === 'SERVER_ISSUED_LATE'
      || authority.submissionOrigin === 'CLIENT_FALLBACK'
    );
}

export function canContributeDashboardSummary(authority: DashboardAttemptAuthorityV1): boolean {
  return authority.scoreAuthority === 'FRONTEND_LEGACY'
    || isOfficialDashboardAttempt(authority)
    || isRecoveredDashboardAttempt(authority);
}

export function canContributeDashboardDeepAnalytics(authority: DashboardAttemptAuthorityV1): boolean {
  return authority.scoreAuthority === 'BACKEND'
    && (isOfficialDashboardAttempt(authority) || isRecoveredDashboardAttempt(authority));
}
