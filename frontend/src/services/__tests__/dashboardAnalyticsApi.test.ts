import { afterEach, describe, expect, it, vi } from 'vitest';
import defaultFixture from '../../../../data/dashboard-analytics-fixtures/response-v1-default.json';
import { ApiRequestError, apiGet } from '../apiClient';
import {
  DashboardAnalyticsApiError,
  getDashboardAnalytics,
} from '../dashboardAnalyticsApi';

vi.mock('../apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apiClient')>();
  return { ...actual, apiGet: vi.fn() };
});

const mockedApiGet = vi.mocked(apiGet);

afterEach(() => {
  vi.restoreAllMocks();
  mockedApiGet.mockReset();
});

describe('dashboardAnalyticsApi', () => {
  it.each([
    ['7d', '/api/exams/dashboard-analytics?range=7d&recentLimit=5'],
    ['all', '/api/exams/dashboard-analytics?range=all&recentLimit=5'],
  ] as const)('builds the %s request with a fixed recent limit', async (range, expectedPath) => {
    mockedApiGet.mockResolvedValue(defaultFixture);
    await getDashboardAnalytics(range);
    expect(mockedApiGet).toHaveBeenCalledWith(expectedPath, { signal: undefined });
  });

  it('forwards AbortSignal through the existing credential-aware API client', async () => {
    const controller = new AbortController();
    mockedApiGet.mockResolvedValue(defaultFixture);
    await getDashboardAnalytics('30d', controller.signal);
    expect(mockedApiGet).toHaveBeenCalledWith(expect.any(String), { signal: controller.signal });
  });

  it('returns a DTO only after runtime validation succeeds', async () => {
    mockedApiGet.mockResolvedValue(defaultFixture);
    await expect(getDashboardAnalytics('30d')).resolves.toMatchObject({ schemaVersion: 1 });
  });

  it('classifies an invalid payload as a contract error without exposing raw content', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedApiGet.mockResolvedValue({ schemaVersion: 99, secretAnswer: 'must-not-leak' });
    const error = await getDashboardAnalytics('30d').catch((value: unknown) => value);
    expect(error).toBeInstanceOf(DashboardAnalyticsApiError);
    expect(error).toMatchObject({ kind: 'contract' });
    expect(String(error)).not.toContain('must-not-leak');
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('must-not-leak');
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [400, 'invalid-request'],
    [503, 'server'],
  ] as const)('classifies HTTP %s', async (status, kind) => {
    mockedApiGet.mockRejectedValue(new ApiRequestError('SAFE_CODE', 'body not forwarded', status));
    await expect(getDashboardAnalytics('30d')).rejects.toMatchObject({ kind, status });
  });

  it('classifies network failures without exposing the transport message', async () => {
    mockedApiGet.mockRejectedValue(new TypeError('request included private payload'));
    const error = await getDashboardAnalytics('30d').catch((value: unknown) => value);
    expect(error).toMatchObject({ kind: 'transport' });
    expect(String(error)).not.toContain('private payload');
  });

  it.each([
    ['AbortError', 'aborted'],
    ['TimeoutError', 'timeout'],
  ] as const)('classifies %s', async (name, kind) => {
    mockedApiGet.mockRejectedValue(new DOMException('safe', name));
    await expect(getDashboardAnalytics('30d')).rejects.toMatchObject({ kind });
  });
});
