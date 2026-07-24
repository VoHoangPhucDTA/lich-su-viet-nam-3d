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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('usePersonalLearningDashboard orchestration', () => {
  it('does not request while auth is loading', () => {
    const request = vi.fn();
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: { isLoading: true, isAuthenticated: false, ownerKey: null },
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    expect(result.current.viewModel.state).toBe('loading');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not request for anonymous users and shows a sign-in-only state', () => {
    const request = vi.fn();
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: anonymous,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    expect(result.current.viewModel.state).toBe('empty');
    expect(result.current.viewModel.recommendations[0]?.actionRoute).toBe('/login');
    expect(result.current.viewModel.summary.totalAttempts).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [readyResponse, 'ready'],
    [emptyResponse, 'empty'],
  ] as const)('maps an authenticated response to %s state', async (response, expectedState) => {
    const request = vi.fn().mockResolvedValue(response);
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '',
      requestDashboard: request,
      fixtureLoader: null,
    }));
    expect(result.current.viewModel.state).toBe('loading');
    await waitFor(() => expect(result.current.viewModel.state).toBe(expectedState));
    expect(request).toHaveBeenCalledTimes(1);
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
  });

  it('uses an explicit DEV fixture without making an HTTP request', async () => {
    const request = vi.fn();
    const fixtureLoader = vi.fn().mockResolvedValue({
      resolveDevelopmentDashboardFixture: () => DASHBOARD_FIXTURES.default,
    });
    const { result } = renderHook(() => usePersonalLearningDashboard({
      auth: authenticated,
      search: '?fixture=default',
      requestDashboard: request,
      fixtureLoader,
    }));
    await waitFor(() => expect(result.current.viewModel.state).toBe('ready'));
    expect(fixtureLoader).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });
});
