import {
  DashboardAnalyticsApiError,
  type DashboardAnalyticsErrorKind,
} from '@/services/dashboardAnalyticsApi';
import { buildLocalDashboardAnalytics } from './localDashboardAggregator';
import { mapLocalDashboardAnalyticsToViewModel } from './localDashboardMappers';
import {
  scanLocalDashboardAttempts,
  type LocalDashboardStorage,
} from './localDashboardRepository';
import type {
  LocalDashboardOwnerFilter,
} from './localDashboardTypes';
import type {
  DashboardRange,
  PersonalLearningDashboardViewModel,
} from '../dashboardTypes';

const FALLBACK_SERVER_STATUSES = new Set([502, 503, 504]);

export type DashboardLocalStorageProvider = () => LocalDashboardStorage | null;

export interface LoadLocalDashboardOptions {
  storage: LocalDashboardStorage | null;
  ownerFilter: LocalDashboardOwnerFilter;
  range: DashboardRange;
  source: 'local' | 'local-fallback';
  now?: Date;
}

export type LocalDashboardLoadResult =
  | {
    kind: 'ready';
    viewModel: PersonalLearningDashboardViewModel;
    excludedDeviceLegacyCount: number;
  }
  | {
    kind: 'no-data';
    storageUnavailable: boolean;
    excludedDeviceLegacyCount: number;
  };

export function getBrowserLocalDashboardStorage(): LocalDashboardStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isLocalFallbackEligible(error: unknown): boolean {
  if (!(error instanceof DashboardAnalyticsApiError)) return false;
  if (error.kind === 'transport' || error.kind === 'timeout') return true;
  return error.kind === 'server' && FALLBACK_SERVER_STATUSES.has(error.status);
}

export function dashboardErrorKind(error: unknown): Exclude<DashboardAnalyticsErrorKind, 'aborted'> {
  if (!(error instanceof DashboardAnalyticsApiError) || error.kind === 'aborted') return 'unknown';
  return error.kind;
}

export function loadLocalDashboard({
  storage,
  ownerFilter,
  range,
  source,
  now = new Date(),
}: LoadLocalDashboardOptions): LocalDashboardLoadResult {
  if (!storage) {
    return { kind: 'no-data', storageUnavailable: true, excludedDeviceLegacyCount: 0 };
  }

  const scanResult = scanLocalDashboardAttempts(storage, { ownerFilter });
  const facts = buildLocalDashboardAnalytics(scanResult, {
    range,
    now,
    ownerFilterKind: ownerFilter.kind,
  });
  const excludedDeviceLegacyCount = facts.excludedOwnerScopeBreakdown['device-legacy-unscoped'];

  if (facts.summary.totalAttempts === 0) {
    return {
      kind: 'no-data',
      storageUnavailable: facts.diagnostics.storageReadErrorCount > 0,
      excludedDeviceLegacyCount,
    };
  }

  return {
    kind: 'ready',
    viewModel: mapLocalDashboardAnalyticsToViewModel(facts, { source }),
    excludedDeviceLegacyCount,
  };
}
