import anonymous from './__fixtures__/anonymous.json';
import backendFallback from './__fixtures__/backend-fallback.json';
import defaultFixture from './__fixtures__/default.json';
import empty from './__fixtures__/empty.json';
import error from './__fixtures__/error.json';
import loading from './__fixtures__/loading.json';
import longContent from './__fixtures__/long-content.json';
import manyAttempts from './__fixtures__/many-attempts.json';
import oneAttempt from './__fixtures__/one-attempt.json';
import partialDetails from './__fixtures__/partial-details.json';
import { DASHBOARD_FIXTURE_KEYS, type DashboardFixtureKey } from './dashboardFixtures';
import type { PersonalLearningDashboardViewModel } from './dashboardTypes';

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

export function resolveDevelopmentDashboardFixture(search: string): PersonalLearningDashboardViewModel {
  const requested = new URLSearchParams(search).get('fixture');
  return DASHBOARD_FIXTURES[isFixtureKey(requested) ? requested : 'default'];
}
