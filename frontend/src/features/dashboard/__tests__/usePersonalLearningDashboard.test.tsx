import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import defaultFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-default.json';
import emptyFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-empty.json';
import partialFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-partial-coverage.json';
import { DashboardAnalyticsApiError } from '@/services/dashboardAnalyticsApi';
import { DASHBOARD_FIXTURES } from '../dashboardDevelopmentFixtures';
import type { DashboardAnalyticsResponseV1 } from '../dashboardAnalyticsTypes';
import { validateDashboardAnalyticsResponseV1 } from '../dashboardAnalyticsValidation';
import {
  usePersonalLearningDashboard,
  type DashboardAuthState,
} from '../usePersonalLearningDashboard';
import type { LocalDashboardStorage } from '../localAnalytics/localDashboardRepository';
import {
  v2DetailedFixture,
  v2SummaryFixture,
} from '../localAnalytics/__tests__/fixtures/localDashboardSyntheticFixtures';

function validated(value: unknown): DashboardAnalyticsResponseV1 {
  const result = validateDashboardAnalyticsResponseV1(value);
  if (!result.success) throw new Error(result.issues.join(', '));
  return result.data;
}

const readyResponse = validated(defaultFixture);
const emptyResponse = validated(emptyFixture);
const partialResponse = validated(partialFixture);
const anonymous: DashboardAuthState = { isLoading: false, isAuthenticated: false, ownerKey: null };
const authenticated: DashboardAuthState = { isLoading: false, isAuthenticated: true, ownerKey: 'owner-a' };
const NOW = new Date('2026-07-24T05:00:00.000Z');
const now = () => NOW;

class MutableFakeStorage implements LocalDashboardStorage {
  private readonly values = new Map<string, string>();
  readonly reads: string[] = [];

  constructor(entries: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(entries)) this.set(key, value);
  }

  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }
  set(key: string, value: unknown) {
    this.values.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
}

const blockedStorageProvider = () => {
  throw new DOMException('blocked', 'SecurityError');
};
const emptyStorageProvider = () => new MutableFakeStorage();

function provider(storage: LocalDashboardStorage | null) {
  return () => storage;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function dispatchStorage(key: string | null) {
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('usePersonalLearningDashboard orchestration', () => {
  it('does not request while auth is loading', () => {
    const request = vi.fn();
    const localStorageProvider = vi.fn();
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: { isLoading: true, isAuthenticated: false, ownerKey: null },
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
    }));
    expect(result.current.viewModel.state).toBe('loading');
    expect(request).not.toHaveBeenCalled();
    expect(localStorageProvider).not.toHaveBeenCalled();
  });

  it('does not request for anonymous users and shows a sign-in-only state', () => {
    const request = vi.fn();
    const localStorageProvider = provider(new MutableFakeStorage());
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: anonymous,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
    }));
    expect(result.current.viewModel.state).toBe('empty');
    expect(result.current.viewModel.recommendations[0]?.actionRoute).toBe('/login');
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('loads explicit anonymous local analytics without requesting backend', async () => {
    const request = vi.fn();
    const storage = new MutableFakeStorage({
      'v2_result_anonymous': v2DetailedFixture({
        sessionId: 'anonymous-result',
        ownerScope: 'anonymous',
      }),
      'v2_result_device': v2SummaryFixture({ sessionId: 'device-result' }),
      'v2_result_owner': v2SummaryFixture({ sessionId: 'owner-result', userId: 'owner-a' }),
    });
    const localStorageProvider = provider(storage);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: anonymous,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    expect(result.current.viewModel.scope.source).toBe('local');
    expect(result.current.viewModel.summary.totalAttempts).toBe(1);
    expect(result.current.viewModel.recentAttempts[0]?.attemptId).toBe('anonymous-result');
    expect(result.current.viewModel.notices.map((notice) => notice.id)).toContain('device-unscoped-excluded');
    expect(result.current.announcement).toBe('Đã tải thống kê cục bộ anonymous trên thiết bị này.');
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps anonymous sign-in state when local storage is unavailable', async () => {
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: anonymous,
      search: '',
      fixtureLoader: null,
      localStorageProvider: blockedStorageProvider,
    }));
    await waitFor(() => expect(result.current.viewModel.notices.map((notice) => notice.id))
      .toContain('local-storage-unavailable'));
    expect(result.current.viewModel.state).toBe('empty');
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
  });

  it.each([
    [readyResponse, 'ready'],
    [emptyResponse, 'empty'],
  ] as const)('maps an authenticated response to %s state', async (response, expectedState) => {
    const request = vi.fn().mockResolvedValue(response);
    const localStorageProvider = vi.fn();
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
    }));
    expect(result.current.viewModel.state).toBe('loading');
    await waitFor(() => expect(result.current.viewModel.state).toBe(expectedState));
    expect(result.current.range).toBe('30d');
    expect(result.current.source).toBe('backend');
    expect(result.current.announcement).toBe('Đã tải thống kê học tập từ máy chủ.');
    expect(request).toHaveBeenCalledTimes(1);
    expect(localStorageProvider).not.toHaveBeenCalled();
  });

  it('keeps partial coverage ready and exposes the mapper notice', async () => {
    const request = vi.fn().mockResolvedValue(partialResponse);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    expect(result.current.viewModel.notices.map((notice) => notice.id)).toContain('partial-detail');
  });

  it('requests a new range and prevents the old response from overwriting it', async () => {
    const oldRequest = deferred<DashboardAnalyticsResponseV1>();
    const newRequest = deferred<DashboardAnalyticsResponseV1>();
    const request = vi.fn()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    act(() => result.current.setRange('all'));
    expect(request).toHaveBeenLastCalledWith('all', expect.any(AbortSignal));

    act(() => newRequest.resolve({
      ...readyResponse,
      scope: { ...readyResponse.scope, range: 'all', fromDate: null },
      summary: { ...readyResponse.summary, totalDurationSeconds: 999 },
    }));
    await waitFor(() => expect(result.current.viewModel.summary.totalDurationSeconds).toBe(999));
    act(() => oldRequest.resolve(readyResponse));
    await act(async () => Promise.resolve());
    expect(result.current.viewModel.scope.range).toBe('all');
    expect(result.current.viewModel.summary.totalDurationSeconds).toBe(999);
  });

  it('retries with a fresh request', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new DashboardAnalyticsApiError('server', 'safe', 503))
      .mockResolvedValueOnce(readyResponse);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['transport', 0],
    ['timeout', 0],
    ['server', 502],
    ['server', 503],
    ['server', 504],
  ] as const)('falls back to exact-owner local data for %s/%s', async (kind, status) => {
    const request = vi.fn().mockRejectedValue(new DashboardAnalyticsApiError(kind, 'safe', status));
    const storage = new MutableFakeStorage({
      'v2_result_owner-a': v2DetailedFixture({ sessionId: 'owner-a-local', userId: 'owner-a' }),
      'v2_result_owner-b': v2DetailedFixture({ sessionId: 'owner-b-local', userId: 'owner-b' }),
      'v2_result_anonymous': v2SummaryFixture({ sessionId: 'anonymous-local', ownerScope: 'anonymous' }),
      'v2_result_device': v2SummaryFixture({ sessionId: 'device-local' }),
    });
    const localStorageProvider = provider(storage);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(result.current.viewModel.scope.source).toBe('local-fallback'));
    expect(result.current.viewModel.summary.totalAttempts).toBe(1);
    expect(result.current.viewModel.recentAttempts[0]?.attemptId).toBe('owner-a-local');
    expect(result.current.viewModel.notices.map((notice) => notice.id))
      .toContain('backend-unavailable-local-fallback');
    expect(result.current.announcement)
      .toBe('Máy chủ không khả dụng. Đang hiển thị riêng dữ liệu cục bộ của tài khoản hiện tại.');
  });

  it.each([
    ['invalid-request', 400],
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['unknown', 404],
    ['unknown', 409],
    ['unknown', 429],
    ['server', 500],
    ['contract', 0],
    ['aborted', 0],
    ['unknown', 0],
  ] as const)('does not use local fallback for %s/%s', async (kind, status) => {
    const request = vi.fn().mockRejectedValue(new DashboardAnalyticsApiError(kind, 'safe', status));
    const localStorageProvider = vi.fn(() => new MutableFakeStorage({
      'v2_result_owner-a': v2DetailedFixture({ sessionId: 'owner-a-local', userId: 'owner-a' }),
    }));
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('error'));
    expect(result.current.viewModel.scope.source).toBe('backend');
    expect(localStorageProvider).not.toHaveBeenCalled();
  });

  it('keeps the backend error when no exact-owner local attempt exists', async () => {
    const request = vi.fn().mockRejectedValue(new DashboardAnalyticsApiError('server', 'safe', 503));
    const storage = new MutableFakeStorage({
      'v2_result_owner-b': v2DetailedFixture({ sessionId: 'owner-b-local', userId: 'owner-b' }),
      'v2_result_device': v2SummaryFixture({ sessionId: 'device-local' }),
    });
    const localStorageProvider = provider(storage);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('error'));
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
    expect(result.current.viewModel.scope.source).toBe('backend');
    expect(result.current.announcement)
      .toBe('Không thể tải thống kê học tập từ máy chủ và không có dữ liệu cục bộ phù hợp.');
  });

  it('keeps backend error and reports unavailable local storage safely', async () => {
    const request = vi.fn().mockRejectedValue(new DashboardAnalyticsApiError('server', 'safe', 503));
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider: blockedStorageProvider,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('error'));
    expect(result.current.viewModel.notices.map((notice) => notice.id)).toContain('local-storage-unavailable');
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
  });

  it('retries backend first and replaces local fallback completely after recovery', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new DashboardAnalyticsApiError('server', 'safe', 503))
      .mockResolvedValueOnce(readyResponse);
    const storage = new MutableFakeStorage({
      'v2_result_owner-a': v2DetailedFixture({ sessionId: 'owner-a-local', userId: 'owner-a' }),
    });
    const localStorageProvider = provider(storage);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(result.current.viewModel.scope.source).toBe('local-fallback'));
    expect(result.current.viewModel.summary.totalAttempts).toBe(1);

    act(() => result.current.retry());
    expect(result.current.viewModel.state).toBe('loading');
    expect(result.current.announcement).toBe('Đang thử tải lại thống kê học tập.');
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    expect(result.current.viewModel.scope.source).toBe('backend');
    expect(result.current.viewModel.summary.totalAttempts).toBe(readyResponse.summary.totalAttempts);
    expect(result.current.viewModel.recentAttempts.some((attempt) => attempt.attemptId === 'owner-a-local')).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('rescans anonymous storage on range change and retry', async () => {
    const storage = new MutableFakeStorage({
      'v2_result_recent': v2SummaryFixture({
        sessionId: 'recent',
        ownerScope: 'anonymous',
        submittedAt: Date.parse('2026-07-23T03:00:00Z'),
      }),
      'v2_result_older': v2SummaryFixture({
        sessionId: 'older',
        ownerScope: 'anonymous',
        submittedAt: Date.parse('2026-07-10T03:00:00Z'),
      }),
    });
    const localStorageProvider = provider(storage);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: anonymous,
      search: '',
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await vi.waitFor(() => expect(result.current.viewModel.summary.totalAttempts).toBe(2));
    act(() => result.current.setRange('7d'));
    await waitFor(() => expect(result.current.viewModel.summary.totalAttempts).toBe(1));

    storage.set('v2_result_new', v2SummaryFixture({
      sessionId: 'new',
      ownerScope: 'anonymous',
      submittedAt: Date.parse('2026-07-24T04:00:00Z'),
    }));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.viewModel.summary.totalAttempts).toBe(2));
  });

  it('debounces relevant anonymous storage events into one rescan', async () => {
    const storage = new MutableFakeStorage({
      'v2_result_initial': v2SummaryFixture({
        sessionId: 'initial',
        ownerScope: 'anonymous',
        submittedAt: Date.parse('2026-07-24T03:00:00Z'),
      }),
    });
    const localStorageProvider = vi.fn(provider(storage));
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: anonymous,
      search: '',
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(result.current.viewModel.summary.totalAttempts).toBe(1));
    vi.useFakeTimers();
    storage.set('v2_result_new', v2SummaryFixture({
      sessionId: 'new',
      ownerScope: 'anonymous',
      submittedAt: Date.parse('2026-07-24T04:00:00Z'),
    }));
    act(() => {
      dispatchStorage('v2_result_new');
      dispatchStorage('exam_history');
      dispatchStorage(null);
      vi.advanceTimersByTime(299);
    });
    expect(localStorageProvider).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    await vi.waitFor(() => expect(result.current.viewModel.summary.totalAttempts).toBe(2));
    expect(localStorageProvider).toHaveBeenCalledTimes(2);
  });

  it('refreshes authenticated backend first after a relevant storage event', async () => {
    const request = vi.fn().mockResolvedValue(readyResponse);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    vi.useFakeTimers();
    act(() => {
      dispatchStorage('v2_result_owner-a');
      vi.advanceTimersByTime(300);
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(result.current.viewModel.scope.source).toBe('backend');
  });

  it('refreshes backend before rescanning exact-owner fallback after a storage event', async () => {
    const request = vi.fn()
      .mockRejectedValue(new DashboardAnalyticsApiError('server', 'safe', 503));
    const storage = new MutableFakeStorage({
      'v2_result_owner-a': v2DetailedFixture({ sessionId: 'owner-a-local', userId: 'owner-a' }),
    });
    const localStorageProvider = vi.fn(provider(storage));
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(result.current.viewModel.scope.source).toBe('local-fallback'));
    vi.useFakeTimers();
    storage.set('v2_result_owner-a-new', v2DetailedFixture({ sessionId: 'owner-a-new', userId: 'owner-a' }));
    act(() => {
      dispatchStorage('v2_result_owner-a-new');
      vi.advanceTimersByTime(300);
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(localStorageProvider).toHaveBeenCalledTimes(2));
    expect(result.current.viewModel.scope.source).toBe('local-fallback');
    expect(result.current.viewModel.summary.totalAttempts).toBe(2);
  });

  it('does not refresh for unrelated, token or session keys', async () => {
    const request = vi.fn().mockResolvedValue(readyResponse);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    vi.useFakeTimers();
    act(() => {
      dispatchStorage('unrelated');
      dispatchStorage('exam_session_token_secret');
      dispatchStorage('exam_api_session_draft_owner-a');
      vi.advanceTimersByTime(500);
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('cleans the storage listener on unmount', async () => {
    const request = vi.fn().mockResolvedValue(readyResponse);
    const { result, unmount } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    vi.useFakeTimers();
    unmount();
    act(() => {
      dispatchStorage('v2_result_owner-a');
      vi.advanceTimersByTime(500);
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not refresh fixture mode or auth-loading mode', async () => {
    const fixtureLoader = vi.fn().mockResolvedValue({
      resolveDevelopmentDashboardFixture: () => DASHBOARD_FIXTURES.default,
    });
    const fixtureRequest = vi.fn();
    const fixture = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '?fixture=default',
      requestDashboard: fixtureRequest,
      fixtureLoader,
      localStorageProvider: vi.fn(),
    }));
    await waitFor(() => expect(fixture.result.current.viewModel.state).toBe('ready'));
    vi.useFakeTimers();
    act(() => {
      dispatchStorage('v2_result_owner-a');
      vi.advanceTimersByTime(500);
    });
    expect(fixtureRequest).not.toHaveBeenCalled();
    fixture.unmount();

    const loadingRequest = vi.fn();
    const loadingLocal = vi.fn();
    const loading = renderHook(() => usePersonalLearningDashboard({
      auth: { isLoading: true, isAuthenticated: false, ownerKey: null },
      search: '',
      requestDashboard: loadingRequest,
      fixtureLoader: null,
      localStorageProvider: loadingLocal,
    }));
    act(() => {
      dispatchStorage('v2_result_owner-a');
      vi.advanceTimersByTime(500);
    });
    expect(loadingRequest).not.toHaveBeenCalled();
    expect(loadingLocal).not.toHaveBeenCalled();
    loading.unmount();
  });

  it('cancels a pending storage refresh when owner changes', async () => {
    const request = vi.fn().mockResolvedValue(readyResponse);
    const { result, rerender } = renderHook(
      ({ auth }) => usePersonalLearningDashboard({
        auth,
        search: '',
        requestDashboard: request,
        fixtureLoader: null,
      }),
      { initialProps: { auth: authenticated } },
    );
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    vi.useFakeTimers();
    act(() => dispatchStorage('v2_result_owner-a'));
    act(() => rerender({ auth: { ...authenticated, ownerKey: 'owner-b' } }));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    act(() => vi.advanceTimersByTime(500));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending storage refresh and uses the new range immediately', async () => {
    const sevenDayResponse = {
      ...readyResponse,
      scope: { ...readyResponse.scope, range: '7d' as const },
    };
    const request = vi.fn()
      .mockResolvedValueOnce(readyResponse)
      .mockResolvedValueOnce(sevenDayResponse);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    vi.useFakeTimers();
    act(() => {
      dispatchStorage('v2_result_owner-a');
      result.current.setRange('7d');
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1]?.[0]).toBe('7d');
    expect(result.current.viewModel.scope.range).toBe('7d');
    act(() => vi.advanceTimersByTime(500));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending storage refresh on logout without retaining account data', async () => {
    const request = vi.fn().mockResolvedValue(readyResponse);
    const localStorageProvider = provider(new MutableFakeStorage());
    const { result, rerender } = renderHook(
      ({ auth }) => usePersonalLearningDashboard({
        auth,
        search: '',
        requestDashboard: request,
        fixtureLoader: null,
        localStorageProvider,
      }),
      { initialProps: { auth: authenticated } },
    );
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    vi.useFakeTimers();
    act(() => dispatchStorage('v2_result_owner-a'));
    act(() => {
      rerender({ auth: anonymous });
      vi.advanceTimersByTime(500);
    });
    expect(request).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await waitFor(() => {
      expect(result.current.viewModel.scope.isAuthenticated).toBe(false);
      expect(result.current.viewModel.summary.totalAttempts).toBe(0);
    });
  });

  it('uses storage events only as signals without reading or logging event values', async () => {
    const valueGetter = vi.fn(() => '{not-json-and-private}');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const localStorageProvider = vi.fn(provider(new MutableFakeStorage()));
    renderHook(() => usePersonalLearningDashboard({
      auth: anonymous,
      search: '',
      fixtureLoader: null,
      localStorageProvider,
      now,
    }));
    await waitFor(() => expect(localStorageProvider).toHaveBeenCalledTimes(1));
    vi.useFakeTimers();
    const event = new StorageEvent('storage', { key: 'v2_result_signal' });
    Object.defineProperty(event, 'newValue', { get: valueGetter });
    act(() => {
      window.dispatchEvent(event);
      vi.advanceTimersByTime(300);
    });
    await vi.waitFor(() => expect(localStorageProvider).toHaveBeenCalledTimes(2));
    expect(valueGetter).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('prevents an older retry request from overwriting the latest response', async () => {
    const first = deferred<DashboardAnalyticsResponseV1>();
    const second = deferred<DashboardAnalyticsResponseV1>();
    const request = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    act(() => result.current.retry());
    act(() => second.resolve({
      ...readyResponse,
      summary: { ...readyResponse.summary, totalDurationSeconds: 222 },
    }));
    await waitFor(() => expect(result.current.viewModel.summary.totalDurationSeconds).toBe(222));
    act(() => first.resolve({
      ...readyResponse,
      summary: { ...readyResponse.summary, totalDurationSeconds: 111 },
    }));
    await act(async () => Promise.resolve());
    expect(result.current.viewModel.summary.totalDurationSeconds).toBe(222);
  });

  it('aborts on unmount', () => {
    const request = vi.fn((_range, signal?: AbortSignal) => new Promise<DashboardAnalyticsResponseV1>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason));
    }));
    const { unmount } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    const signal = request.mock.calls[0]?.[1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('clears backend data on logout and ignores the former owner response', async () => {
    const pending = deferred<DashboardAnalyticsResponseV1>();
    const request = vi.fn().mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ auth }) => usePersonalLearningDashboard({ auth, search: '', requestDashboard: request, fixtureLoader: null }),
      { initialProps: { auth: authenticated } },
    );
    rerender({ auth: anonymous });
    expect(result.current.viewModel.scope.isAuthenticated).toBe(false);
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
    act(() => pending.resolve(readyResponse));
    await act(async () => Promise.resolve());
    expect(result.current.viewModel.scope.isAuthenticated).toBe(false);
  });

  it('does not expose the previous owner while switching users', async () => {
    const second = deferred<DashboardAnalyticsResponseV1>();
    const request = vi.fn()
      .mockResolvedValueOnce(readyResponse)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ auth }) => usePersonalLearningDashboard({ auth, search: '', requestDashboard: request, fixtureLoader: null }),
      { initialProps: { auth: authenticated } },
    );
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    rerender({ auth: { ...authenticated, ownerKey: 'owner-b' } });
    expect(result.current.viewModel.state).toBe('loading');
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
  });

  it('clears anonymous local KPI immediately when login starts backend loading', async () => {
    const backend = deferred<DashboardAnalyticsResponseV1>();
    const request = vi.fn().mockReturnValue(backend.promise);
    const storage = new MutableFakeStorage({
      'v2_result_anonymous': v2DetailedFixture({
        sessionId: 'anonymous-result',
        ownerScope: 'anonymous',
      }),
    });
    const localStorageProvider = provider(storage);
    const { result, rerender } = renderHook(
      ({ auth }) => usePersonalLearningDashboard({
        auth,
        search: '',
        requestDashboard: request,
        fixtureLoader: null,
        localStorageProvider,
        now,
      }),
      { initialProps: { auth: anonymous } },
    );
    await waitFor(() => expect(result.current.viewModel.scope.source).toBe('local'));
    rerender({ auth: authenticated });
    expect(result.current.viewModel.state).toBe('loading');
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
  });

  it('ignores owner A fallback after switching to owner B', async () => {
    const ownerARequest = deferred<DashboardAnalyticsResponseV1>();
    const ownerBRequest = deferred<DashboardAnalyticsResponseV1>();
    const request = vi.fn()
      .mockReturnValueOnce(ownerARequest.promise)
      .mockReturnValueOnce(ownerBRequest.promise);
    const storage = new MutableFakeStorage({
      'v2_result_owner-a': v2DetailedFixture({ sessionId: 'owner-a-local', userId: 'owner-a' }),
      'v2_result_owner-b': v2DetailedFixture({ sessionId: 'owner-b-local', userId: 'owner-b' }),
    });
    const localStorageProvider = provider(storage);
    const { result, rerender } = renderHook(
      ({ auth }) => usePersonalLearningDashboard({
        auth,
        search: '',
        requestDashboard: request,
        fixtureLoader: null,
        localStorageProvider,
        now,
      }),
      { initialProps: { auth: authenticated } },
    );
    rerender({ auth: { ...authenticated, ownerKey: 'owner-b' } });
    act(() => ownerARequest.reject(new DashboardAnalyticsApiError('server', 'safe', 503)));
    await act(async () => Promise.resolve());
    expect(result.current.viewModel.state).toBe('loading');
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
    expect(result.current.viewModel.recentAttempts.some((attempt) => attempt.attemptId === 'owner-a-local')).toBe(false);
  });

  it('does not request again when only the auth object identity changes', async () => {
    const request = vi.fn().mockResolvedValue(readyResponse);
    const { result, rerender } = renderHook(
      ({ auth }) => usePersonalLearningDashboard({
        auth,
        search: '',
        requestDashboard: request,
        fixtureLoader: null,
        localStorageProvider: emptyStorageProvider,
      }),
      { initialProps: { auth: authenticated } },
    );
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    rerender({ auth: { ...authenticated } });
    await act(async () => Promise.resolve());
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not announce or request when setRange receives the current range', async () => {
    const request = vi.fn().mockResolvedValue(readyResponse);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.source).toBe('backend'));
    const announcement = result.current.announcement;
    act(() => result.current.setRange('30d'));
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.announcement).toBe(announcement);
  });

  describe('request timeout', () => {
    it('aborts with TimeoutError and surfaces the timeout error after 15 seconds', async () => {
      vi.useFakeTimers();
      let capturedSignal: AbortSignal | undefined;
      const request = vi.fn((_range: string, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise<never>(() => undefined);
      });
      const { result } = renderHook(() => usePersonalLearningDashboard({
        auth: authenticated,
        search: '',
        requestDashboard: request,
        fixtureLoader: null,
        localStorageProvider: emptyStorageProvider,
      }));

      await act(async () => vi.advanceTimersByTimeAsync(15_000));

      expect(capturedSignal?.aborted).toBe(true);
      expect((capturedSignal?.reason as DOMException).name).toBe('TimeoutError');
      await vi.waitFor(() => expect(result.current.viewModel.state).toBe('error'));
      expect(result.current.viewModel.notices[0]?.title).toBe('Tải thống kê quá thời gian chờ');
    });

    it('falls back to exact-owner local data when the request times out', async () => {
      vi.useFakeTimers();
      const storage = new MutableFakeStorage({
        'v2_result_owner-a': v2DetailedFixture({ sessionId: 'timeout-local', userId: 'owner-a' }),
      });
      const { result } = renderHook(() => usePersonalLearningDashboard({
        auth: authenticated,
        search: '',
        requestDashboard: vi.fn(() => new Promise<never>(() => undefined)),
        fixtureLoader: null,
        localStorageProvider: provider(storage),
        now,
      }));

      await act(async () => vi.advanceTimersByTimeAsync(15_000));

      await vi.waitFor(() => expect(result.current.viewModel.scope.source).toBe('local-fallback'));
      expect(result.current.viewModel.recentAttempts[0]?.attemptId).toBe('timeout-local');
    });

    it('clears the timeout after a successful response', async () => {
      const clearSpy = vi.spyOn(window, 'clearTimeout');
      const { result } = renderHook(() => usePersonalLearningDashboard({
        auth: authenticated,
        search: '',
        requestDashboard: vi.fn().mockResolvedValue(readyResponse),
        fixtureLoader: null,
      }));
      await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
      expect(clearSpy).toHaveBeenCalled();
      expect(result.current.viewModel.state).toBe('ready');
    });

    it('cancels the pending timeout on unmount', async () => {
      vi.useFakeTimers();
      const clearSpy = vi.spyOn(window, 'clearTimeout');
      const { unmount } = renderHook(() => usePersonalLearningDashboard({
        auth: authenticated,
        search: '',
        requestDashboard: vi.fn(() => new Promise<never>(() => undefined)),
        fixtureLoader: null,
      }));
      unmount();
      expect(clearSpy).toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(20_000));
    });
  });

  it.each([
    ['unauthenticated', 'Phiên đăng nhập đã hết hạn'],
    ['forbidden', 'Không có quyền xem thống kê'],
    ['server', 'Máy chủ thống kê đang tạm gián đoạn'],
    ['contract', 'Dữ liệu thống kê không đúng định dạng'],
    ['transport', 'Không thể kết nối máy chủ thống kê'],
    ['timeout', 'Tải thống kê quá thời gian chờ'],
  ] as const)('renders %s as an explicit error without local fallback', async (kind, title) => {
    const request = vi.fn().mockRejectedValue(new DashboardAnalyticsApiError(kind, 'safe'));
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('error'));
    expect(result.current.viewModel.scope.source).toBe('backend');
    expect(result.current.viewModel.notices[0]?.title).toBe(title);
    expect(result.current.announcement).toBe(
      kind === 'transport' || kind === 'timeout'
        ? 'Không thể tải thống kê học tập từ máy chủ và không có dữ liệu cục bộ phù hợp.'
        : 'Không thể tải thống kê học tập.',
    );
  });

  it('uses an explicit DEV fixture without making an HTTP request', async () => {
    const request = vi.fn();
    const localStorageProvider = vi.fn();
    const fixtureLoader = vi.fn().mockResolvedValue({
      resolveDevelopmentDashboardFixture: () => DASHBOARD_FIXTURES.default,
    });
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '?fixture=default',
      requestDashboard: request,
      fixtureLoader,
      localStorageProvider,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    expect(fixtureLoader).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(localStorageProvider).not.toHaveBeenCalled();
  });
});
