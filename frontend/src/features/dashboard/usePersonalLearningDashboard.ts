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
import type { DashboardRange, PersonalLearningDashboardViewModel } from './dashboardTypes';

const DASHBOARD_REQUEST_TIMEOUT_MS = 15_000;

const defaultFixtureLoader: DashboardDevelopmentFixtureLoader | null = import.meta.env.DEV
  ? () => import('./dashboardDevelopmentFixtures')
  : null;

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
}

type DashboardRuntimeSource = 'fixture' | 'backend' | 'anonymous' | 'loading' | 'error';

interface DashboardRuntimeState {
  ownerKey: string | null;
  range: DashboardRange;
  source: DashboardRuntimeSource;
  viewModel: PersonalLearningDashboardViewModel;
}

function requestedFixture(search: string): boolean {
  return import.meta.env.DEV && new URLSearchParams(search).has('fixture');
}

function errorKind(error: unknown): DashboardErrorKind {
  if (!(error instanceof DashboardAnalyticsApiError)) return 'unknown';
  if (error.kind === 'aborted') return 'unknown';
  return error.kind;
}

export function usePersonalLearningDashboard({
  auth,
  search,
  initialViewModel,
  requestDashboard = getDashboardAnalytics,
  fixtureLoader = defaultFixtureLoader,
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
        setRuntime({
          ownerKey,
          range: backendRange,
          source: 'error',
          viewModel: createDashboardApiErrorViewModel(timedOut ? 'timeout' : errorKind(error), backendRange),
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

  const viewModel = useMemo(() => {
    if (fixtureMode) return runtime.viewModel;
    if (auth.isLoading) return createDashboardLoadingViewModel(range);
    if (!auth.isAuthenticated || !auth.ownerKey) return createDashboardAnonymousViewModel(range);
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
