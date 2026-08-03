import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_FIXTURES,
  resolveDevelopmentDashboardFixture,
} from '../dashboardDevelopmentFixtures';
import {
  DASHBOARD_FIXTURE_KEYS,
  DASHBOARD_NOT_CONNECTED_MESSAGE,
  loadDashboardPresentationState,
} from '../dashboardFixtures';
import { DASHBOARD_NOTICE_IDS } from '../dashboardTypes';

const ROOT_FIELDS = [
  'state',
  'scope',
  'summary',
  'recommendations',
  'scoreTrend',
  'strengths',
  'weaknesses',
  'questionTypePerformance',
  'cognitivePerformance',
  'recentAttempts',
  'coverage',
  'notices',
] as const;

describe('dashboard development fixtures', () => {
  it('parses all ten frontend-owned fixtures with the complete ViewModel root shape', () => {
    expect(DASHBOARD_FIXTURE_KEYS).toHaveLength(10);
    for (const key of DASHBOARD_FIXTURE_KEYS) {
      const fixture = DASHBOARD_FIXTURES[key];
      expect(fixture).toBeTruthy();
      expect(Object.keys(fixture).sort()).toEqual([...ROOT_FIELDS].sort());
      expect(['ready', 'empty', 'loading', 'error']).toContain(fixture.state);
      expect(fixture.scope.timezone).toBe('Asia/Ho_Chi_Minh');
    }
  });

  it('keeps every fixture notice id inside the DashboardNoticeId union', () => {
    // Fixture JSON được nạp qua ép kiểu `as PersonalLearningDashboardViewModel`
    // (dashboardDevelopmentFixtures.ts) nên tsc không kiểm tra được `id` trong JSON.
    // Test này bịt kẽ hở đó: mọi notice.id của cả 10 fixture phải thuộc union,
    // và không fixture nào chứa hai notice trùng id (trùng id gây trùng React key).
    const validIds = new Set<string>(DASHBOARD_NOTICE_IDS);
    for (const key of DASHBOARD_FIXTURE_KEYS) {
      const seen = new Set<string>();
      for (const notice of DASHBOARD_FIXTURES[key].notices) {
        expect(validIds.has(notice.id), `fixture "${key}" có notice id lạ "${notice.id}"`).toBe(true);
        expect(seen.has(notice.id), `fixture "${key}" lặp notice id "${notice.id}"`).toBe(false);
        seen.add(notice.id);
      }
    }
  });

  it('uses default for an absent or unknown development fixture query', () => {
    expect(resolveDevelopmentDashboardFixture('')).toBe(DASHBOARD_FIXTURES.default);
    expect(resolveDevelopmentDashboardFixture('?fixture=unknown')).toBe(DASHBOARD_FIXTURES.default);
    expect(resolveDevelopmentDashboardFixture('?fixture=error')).toBe(DASHBOARD_FIXTURES.error);
  });

  it('loads development fixtures only when a development loader is explicitly available', async () => {
    const result = await loadDashboardPresentationState(
      '?fixture=one-attempt',
      () => import('../dashboardDevelopmentFixtures'),
    );
    expect(result.source).toBe('development-fixture');
    expect(result.viewModel).toBe(DASHBOARD_FIXTURES['one-attempt']);
  });

  it('returns an explicit unavailable state without fake metrics when no development loader exists', async () => {
    const result = await loadDashboardPresentationState('?fixture=default', null);
    expect(result.source).toBe('unavailable');
    expect(result.viewModel.state).toBe('error');
    expect(result.viewModel.summary.totalAttempts).toBe(0);
    expect(result.viewModel.notices[0]?.message).toBe(DASHBOARD_NOT_CONNECTED_MESSAGE);
  });
});
