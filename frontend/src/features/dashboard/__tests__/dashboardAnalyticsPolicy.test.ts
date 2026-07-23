import { describe, expect, it } from 'vitest';
import {
  canContributeDashboardDeepAnalytics,
  canContributeDashboardSummary,
  classifyDashboardInsight,
  dashboardConfidence,
  isOfficialDashboardAttempt,
  isRecoveredDashboardAttempt,
  mapDashboardBackendMode,
} from '../dashboardAnalyticsPolicy';

describe('dashboard analytics threshold policy', () => {
  it.each([
    [{ accuracy: 80, totalUnits: 7, attemptCount: 2 }, 'insufficient-data'],
    [{ accuracy: 80, totalUnits: 8, attemptCount: 1 }, 'insufficient-data'],
    [{ accuracy: 80, totalUnits: 8, attemptCount: 2 }, 'strength'],
    [{ accuracy: 60, totalUnits: 8, attemptCount: 2 }, 'developing'],
    [{ accuracy: 59.99, totalUnits: 8, attemptCount: 2 }, 'weakness'],
  ] as const)('classifies sample %o as %s', (sample, expected) => {
    expect(classifyDashboardInsight(sample)).toBe(expected);
  });

  it.each([
    [{ totalUnits: 16, attemptCount: 2 }, 'low'],
    [{ totalUnits: 16, attemptCount: 3 }, 'medium'],
    [{ totalUnits: 30, attemptCount: 4 }, 'medium'],
    [{ totalUnits: 30, attemptCount: 5 }, 'high'],
  ] as const)('classifies confidence sample %o as %s', (sample, expected) => {
    expect(dashboardConfidence(sample)).toBe(expected);
  });

  it('maps only the two backend dashboard modes to UI modes', () => {
    expect(mapDashboardBackendMode('TIMED_ORIGINAL')).toBe('thi_thu');
    expect(mapDashboardBackendMode('CUSTOM_MOCK')).toBe('custom_mock');
  });
});

describe('dashboard analytics authority policy', () => {
  const official = {
    scoreAuthority: 'BACKEND',
    timingAuthority: 'SERVER',
    submissionOrigin: 'SERVER_ON_TIME',
  } as const;
  const late = {
    scoreAuthority: 'BACKEND',
    timingAuthority: 'CLIENT_UNVERIFIED',
    submissionOrigin: 'SERVER_ISSUED_LATE',
  } as const;
  const fallback = {
    scoreAuthority: 'BACKEND',
    timingAuthority: 'CLIENT_UNVERIFIED',
    submissionOrigin: 'CLIENT_FALLBACK',
  } as const;
  const legacy = {
    scoreAuthority: 'FRONTEND_LEGACY',
    timingAuthority: 'LOCAL',
    submissionOrigin: 'LOCAL_FALLBACK',
  } as const;

  it('recognizes only BACKEND/SERVER/SERVER_ON_TIME as official', () => {
    expect(isOfficialDashboardAttempt(official)).toBe(true);
    expect(isOfficialDashboardAttempt(late)).toBe(false);
    expect(isOfficialDashboardAttempt(fallback)).toBe(false);
  });

  it('recognizes the two recovered learning authority triples', () => {
    expect(isRecoveredDashboardAttempt(late)).toBe(true);
    expect(isRecoveredDashboardAttempt(fallback)).toBe(true);
    expect(isRecoveredDashboardAttempt(official)).toBe(false);
  });

  it('allows legacy only in summary and keeps deep analytics backend-only', () => {
    expect(canContributeDashboardSummary(legacy)).toBe(true);
    expect(canContributeDashboardDeepAnalytics(legacy)).toBe(false);
    expect(canContributeDashboardDeepAnalytics(official)).toBe(true);
    expect(canContributeDashboardDeepAnalytics(late)).toBe(true);
  });
});
