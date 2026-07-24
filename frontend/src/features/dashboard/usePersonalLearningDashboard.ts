import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DashboardAnalyticsApiError,
  getDashboardAnalytics,
  type DashboardAnalyticsRequest,
} from '@/services/dashboardAnalyticsApi';
import {
  createDashboardAnonymousViewModel,
  createDashboardApiErrorViewModel,
  createDashboardLoadingViewModel,
  type DashboardDevelopmentFixtureLoader,
  type DashboardErrorKind,
} from './dashboardFixtures';
import { mapDashboardAnalyticsToViewModel } from './dashboardMappers';
import {
  dashboardErrorKind,
  getBrowserLocalDashboardStorage,
  isLocalFallbackEligible,
  isRelevantLocalDashboardStorageEvent,
  loadLocalDashboard,
  type DashboardLocalStorageProvider,
  type LocalDashboardLoadResult,
} from './localAnalytics/localDashboardSource';
import type { DashboardRange, PersonalLearningDashboardViewModel } from './dashboardTypes';

const DASHBOARD_REQUEST_TIMEOUT_MS = 15_000;
const DASHBOARD_STORAGE_REFRESH_DEBOUNCE_MS = 300;

const defaultFixtureLoader: DashboardDevelopmentFixtureLoader | null = import.meta.env.DEV
  ? () => import('./dashboardDevelopmentFixtures')
  : null;
const defaultDashboardNow = () => new Date();

export interface DashboardAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  ownerKey: string | null;
}

export interface UsePersonalLearningDashboardOptions {
  auth: DashboardAuthState;
  search: string;
  initialViewModel?: PersonalLearningDashboardViewModel;
  requestDashboard?: DashboardAnalyticsRequest;
  fixtureLoader?: DashboardDevelopmentFixtureLoader | null;
  localStorageProvider?: DashboardLocalStorageProvider;
  loadLocal?: typeof loadLocalDashboard;
  now?: () => Date;
}

type DashboardRuntimeSource =
  | 'fixture'
  | 'backend'
  | 'local'
  | 'local-fallback'
  | 'anonymous'
  | 'loading'
  | 'error';

interface DashboardRuntimeState {
  ownerKey: string | null;
  range: DashboardRange;
  source: DashboardRuntimeSource;
  viewModel: PersonalLearningDashboardViewModel;
}

function requestedFixture(search: string): boolean {
  return import.meta.env.DEV && new URLSearchParams(search).has('fixture');
}

function withAnonymousLocalDiagnostics(
  range: DashboardRange,
  result: Extract<LocalDashboardLoadResult, { kind: 'no-data' }>,
): PersonalLearningDashboardViewModel {
  const viewModel = createDashboardAnonymousViewModel(range);
  const notices = [...viewModel.notices];
  if (result.excludedDeviceLegacyCount > 0) {
    notices.push({
      id: 'device-unscoped-excluded',
      type: 'info',
      title: 'Một số dữ liệu cũ không được tính',
      message: 'Một số kết quả cũ trên thiết bị đã bị loại vì không xác định được chủ sở hữu.',
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (result.storageUnavailable) {
    notices.push({
      id: 'local-storage-unavailable',
      type: 'warning',
      title: 'Không thể đọc dữ liệu trên thiết bị',
      message: 'Dashboard anonymous không thể kiểm tra dữ liệu cục bộ trong phiên này.',
      actionLabel: null,
      actionRoute: null,
    });
  }
  return { ...viewModel, notices };
}

function withFallbackStorageNotice(
  viewModel: PersonalLearningDashboardViewModel,
  storageUnavailable: boolean,
): PersonalLearningDashboardViewModel {
  if (!storageUnavailable) return viewModel;
  return {
    ...viewModel,
    notices: [...viewModel.notices, {
      id: 'local-storage-unavailable',
      type: 'warning',
      title: 'Không thể đọc dữ liệu dự phòng trên thiết bị',
      message: 'Yêu cầu máy chủ không thành công và dữ liệu cục bộ cũng không thể được đọc an toàn.',
      actionLabel: null,
      actionRoute: null,
    }],
  };
}

function safeLocalStorage(provider: DashboardLocalStorageProvider) {
  try {
    return provider();
  } catch {
    return null;
  }
}

export function usePersonalLearningDashboard({
  auth,
  search,
  initialViewModel,
  requestDashboard = getDashboardAnalytics,
  fixtureLoader = defaultFixtureLoader,
  localStorageProvider = getBrowserLocalDashboardStorage,
  loadLocal = loadLocalDashboard,
  now = defaultDashboardNow,
}: UsePersonalLearningDashboardOptions) {
  const fixtureMode = initialViewModel !== undefined || requestedFixture(search);
  const [range, setRangeState] = useState<DashboardRange>(initialViewModel?.scope.range ?? '30d');
  const [retryVersion, setRetryVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const requestVersion = useRef(0);
  const backendRange: DashboardRange = fixtureMode ? '30d' : range;
  const [runtime, setRuntime] = useState<DashboardRuntimeState>(() => ({
    ownerKey: initialViewModel ? 'fixture' : null,
    range: initialViewModel?.scope.range ?? '30d',
    source: initialViewModel ? 'fixture' : 'loading',
    viewModel: initialViewModel ?? createDashboardLoadingViewModel(),
  }));

  useEffect(() => {
    if (initialViewModel && retryVersion === 0) return undefined;

    const version = ++requestVersion.current;
    const controller = new AbortController();
    let timeoutId: number | null = null;

    if (fixtureMode) {
      if (!fixtureLoader) {
        void Promise.resolve().then(() => {
          if (controller.signal.aborted || requestVersion.current !== version) return;
          setRuntime({
            ownerKey: 'fixture',
            range: backendRange,
            source: 'error',
            viewModel: createDashboardApiErrorViewModel('unknown', backendRange),
          });
        });
        return () => controller.abort();
      }
      void fixtureLoader()
        .then((fixtures) => {
          if (controller.signal.aborted || requestVersion.current !== version) return;
          const fixtureSearch = initialViewModel ? '?fixture=default' : search;
          const viewModel = fixtures.resolveDevelopmentDashboardFixture(fixtureSearch);
          setRangeState(viewModel.scope.range);
          setRuntime({ ownerKey: 'fixture', range: viewModel.scope.range, source: 'fixture', viewModel });
        })
        .catch(() => {
          if (controller.signal.aborted || requestVersion.current !== version) return;
          setRuntime({
            ownerKey: 'fixture',
            range: backendRange,
            source: 'error',
            viewModel: createDashboardApiErrorViewModel('unknown', backendRange),
          });
        });
      return () => controller.abort();
    }

    if (auth.isLoading) {
      return () => controller.abort();
    }

    if (!auth.isAuthenticated || !auth.ownerKey) {
      const localResult = loadLocal({
        storage: safeLocalStorage(localStorageProvider),
        ownerFilter: { kind: 'anonymous' },
        range: backendRange,
        source: 'local',
        now: now(),
      });
      void Promise.resolve().then(() => {
        if (controller.signal.aborted || requestVersion.current !== version) return;
        if (localResult.kind === 'ready') {
          setRuntime({
            ownerKey: 'anonymous',
            range: backendRange,
            source: 'local',
            viewModel: localResult.viewModel,
          });
          setAnnouncement('Đã tải thống kê cục bộ anonymous trên thiết bị này.');
        } else {
          setRuntime({
            ownerKey: 'anonymous',
            range: backendRange,
            source: 'anonymous',
            viewModel: withAnonymousLocalDiagnostics(backendRange, localResult),
          });
        }
      });
      return () => controller.abort();
    }

    const ownerKey = auth.ownerKey;
    timeoutId = window.setTimeout(() => {
      controller.abort(new DOMException('Dashboard request timed out', 'TimeoutError'));
    }, DASHBOARD_REQUEST_TIMEOUT_MS);

    void requestDashboard(backendRange, controller.signal)
      .then((response) => {
        if (controller.signal.aborted || requestVersion.current !== version) return;
        setRuntime({
          ownerKey,
          range: backendRange,
          source: 'backend',
          viewModel: mapDashboardAnalyticsToViewModel(response),
        });
        setAnnouncement('Đã tải thống kê học tập từ máy chủ.');
      })
      .catch((error: unknown) => {
        const timedOut = controller.signal.reason instanceof DOMException
          && controller.signal.reason.name === 'TimeoutError';
        if ((controller.signal.aborted && !timedOut) || requestVersion.current !== version) return;
        const effectiveError = timedOut
          ? new DashboardAnalyticsApiError('timeout', 'Dashboard request timed out.')
          : error;
        if (isLocalFallbackEligible(effectiveError)) {
          const localResult = loadLocal({
            storage: safeLocalStorage(localStorageProvider),
            ownerFilter: { kind: 'authenticated-owner', ownerKey },
            range: backendRange,
            source: 'local-fallback',
            now: now(),
          });
          if (controller.signal.aborted || requestVersion.current !== version) return;
          if (localResult.kind === 'ready') {
            setRuntime({
              ownerKey,
              range: backendRange,
              source: 'local-fallback',
              viewModel: localResult.viewModel,
            });
            setAnnouncement('Máy chủ không khả dụng. Đang hiển thị riêng dữ liệu cục bộ của tài khoản hiện tại.');
            return;
          }
          const errorViewModel = createDashboardApiErrorViewModel(
            dashboardErrorKind(effectiveError) as DashboardErrorKind,
            backendRange,
          );
          setRuntime({
            ownerKey,
            range: backendRange,
            source: 'error',
            viewModel: withFallbackStorageNotice(errorViewModel, localResult.storageUnavailable),
          });
          setAnnouncement('Không thể tải thống kê học tập từ máy chủ và không có dữ liệu cục bộ phù hợp.');
          return;
        }
        setRuntime({
          ownerKey,
          range: backendRange,
          source: 'error',
          viewModel: createDashboardApiErrorViewModel(
            dashboardErrorKind(effectiveError) as DashboardErrorKind,
            backendRange,
          ),
        });
        setAnnouncement('Không thể tải thống kê học tập.');
      })
      .finally(() => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      });

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    auth.isAuthenticated,
    auth.isLoading,
    auth.ownerKey,
    fixtureLoader,
    fixtureMode,
    initialViewModel,
    loadLocal,
    localStorageProvider,
    now,
    backendRange,
    requestDashboard,
    retryVersion,
    search,
  ]);

  const setRange = useCallback((nextRange: DashboardRange) => {
    setRangeState(nextRange);
    const rangeLabel = nextRange === 'all' ? 'Tất cả' : nextRange.replace('d', ' ngày');
    setAnnouncement(fixtureMode
      ? `Đã chuyển khoảng thời gian sang ${rangeLabel}. Dữ liệu fixture QA hiện tại được giữ nguyên.`
      : `Đang tải thống kê cho khoảng ${rangeLabel}.`);
    if (fixtureMode) {
      setRuntime((current) => ({
        ...current,
        range: nextRange,
        viewModel: {
          ...current.viewModel,
          scope: { ...current.viewModel.scope, range: nextRange },
        },
      }));
    }
  }, [fixtureMode]);

  const retry = useCallback(() => {
    setAnnouncement('Đang thử tải lại thống kê học tập.');
    setRuntime((current) => ({
      ...current,
      source: 'loading',
      viewModel: createDashboardLoadingViewModel(range),
    }));
    setRetryVersion((value) => value + 1);
  }, [range]);

  useEffect(() => {
    if (fixtureMode || auth.isLoading || typeof window === 'undefined') return undefined;

    let refreshTimer: number | null = null;
    const onStorage = (event: StorageEvent) => {
      if (!isRelevantLocalDashboardStorageEvent(event)) return;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        retry();
      }, DASHBOARD_STORAGE_REFRESH_DEBOUNCE_MS);
    };

    window.addEventListener('storage', onStorage);
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener('storage', onStorage);
    };
  }, [
    auth.isAuthenticated,
    auth.isLoading,
    auth.ownerKey,
    fixtureMode,
    retry,
  ]);

  const viewModel = useMemo(() => {
    if (fixtureMode) return runtime.viewModel;
    if (auth.isLoading) return createDashboardLoadingViewModel(range);
    if (!auth.isAuthenticated || !auth.ownerKey) {
      if (runtime.ownerKey !== 'anonymous' || runtime.range !== range) {
        return createDashboardAnonymousViewModel(range);
      }
      return runtime.viewModel;
    }
    if (runtime.ownerKey !== auth.ownerKey || runtime.range !== range) {
      return createDashboardLoadingViewModel(range);
    }
    return runtime.viewModel;
  }, [auth.isAuthenticated, auth.isLoading, auth.ownerKey, fixtureMode, range, runtime]);

  return {
    viewModel,
    range,
    source: runtime.source,
    announcement,
    setRange,
    retry,
  };
}
