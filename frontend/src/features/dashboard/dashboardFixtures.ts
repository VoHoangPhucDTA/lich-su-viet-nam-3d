import anonymous from '../../../../docs/dashboard-design-handoff/mock-data/anonymous.json';
import backendFallback from '../../../../docs/dashboard-design-handoff/mock-data/backend-fallback.json';
import defaultFixture from '../../../../docs/dashboard-design-handoff/mock-data/default.json';
import empty from '../../../../docs/dashboard-design-handoff/mock-data/empty.json';
import error from '../../../../docs/dashboard-design-handoff/mock-data/error.json';
import loading from '../../../../docs/dashboard-design-handoff/mock-data/loading.json';
import longContent from '../../../../docs/dashboard-design-handoff/mock-data/long-content.json';
import manyAttempts from '../../../../docs/dashboard-design-handoff/mock-data/many-attempts.json';
import oneAttempt from '../../../../docs/dashboard-design-handoff/mock-data/one-attempt.json';
import partialDetails from '../../../../docs/dashboard-design-handoff/mock-data/partial-details.json';
import type { PersonalLearningDashboardViewModel } from './dashboardTypes';

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

const fixture = (value: unknown) => value as PersonalLearningDashboardViewModel;

export const DASHBOARD_FIXTURES: Record<DashboardFixtureKey, PersonalLearningDashboardViewModel> = {
  default: fixture(defaultFixture),
  loading: fixture(loading),
  error: fixture(error),
  empty: fixture(empty),
  'one-attempt': fixture(oneAttempt),
  anonymous: fixture(anonymous),
  'backend-fallback': fixture(backendFallback),
  'partial-details': fixture(partialDetails),
  'long-content': fixture(longContent),
  'many-attempts': fixture(manyAttempts),
};

function isFixtureKey(value: string | null): value is DashboardFixtureKey {
  return value !== null && DASHBOARD_FIXTURE_KEYS.some((key) => key === value);
}

export function resolveDashboardFixture(search: string, isDevelopment = import.meta.env.DEV) {
  if (!isDevelopment) return DASHBOARD_FIXTURES.default;
  const requested = new URLSearchParams(search).get('fixture');
  return DASHBOARD_FIXTURES[isFixtureKey(requested) ? requested : 'default'];
}
