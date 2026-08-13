import { Navigate, useLocation } from 'react-router-dom';
import {
  getHistoricalPeriodById,
  getPeriodQueryRange,
  intersectHistoricalPeriodRanges,
} from '../../data/historicalPeriods';

const COMPATIBLE_PARAMS = ['q', 'type', 'grade', 'sortBy', 'sortDir'] as const;

function parseYear(value: string | null): number | undefined {
  if (value == null || !/^-?\d+$/.test(value.trim())) return undefined;
  return Number(value);
}

function getLegacyPeriodsRedirectTarget(search: string): string {
  const oldParams = new URLSearchParams(search);
  const period = getHistoricalPeriodById(oldParams.get('period'));
  if (!period) return '/browse';

  const next = new URLSearchParams();
  for (const key of COMPATIBLE_PARAMS) {
    const value = oldParams.get(key);
    if (value) next.set(key, value);
  }

  const hasManualRange = oldParams.has('from') || oldParams.has('to');
  const manualFrom = parseYear(oldParams.get('from'));
  const manualToInclusive = parseYear(oldParams.get('to'));

  if (!hasManualRange || (oldParams.has('from') && manualFrom == null) || (oldParams.has('to') && manualToInclusive == null)) {
    next.set('period', period.id);
  } else {
    const intersection = intersectHistoricalPeriodRanges(
      getPeriodQueryRange(period.id) ?? {},
      {
        startYearFrom: manualFrom,
        startYearTo: manualToInclusive != null ? manualToInclusive + 1 : undefined,
      }
    );
    if (intersection) {
      if (intersection.startYearFrom != null) next.set('from', String(intersection.startYearFrom));
      if (intersection.startYearTo != null) next.set('to', String(intersection.startYearTo - 1));
    } else {
      next.set('from', '1');
      next.set('to', '0');
    }
  }

  const query = next.toString();
  return query ? `/browse?${query}` : '/browse';
}

export default function LegacyPeriodsRedirect() {
  const location = useLocation();
  return <Navigate replace to={getLegacyPeriodsRedirectTarget(location.search)} />;
}
