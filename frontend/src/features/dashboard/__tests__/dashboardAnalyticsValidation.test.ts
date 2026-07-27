import { describe, expect, it } from 'vitest';
import authorityMixFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-authority-mix.json';
import defaultFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-default.json';
import emptyFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-empty.json';
import partialFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-partial-coverage.json';
import { validateDashboardAnalyticsResponseV1 } from '../dashboardAnalyticsValidation';

function cloneRecord(value: unknown): Record<string, unknown> {
  const cloned: unknown = structuredClone(value);
  if (typeof cloned !== 'object' || cloned === null || Array.isArray(cloned)) {
    throw new Error('Expected object fixture');
  }
  return cloned as Record<string, unknown>;
}

function nestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected object at ${key}`);
  }
  return value as Record<string, unknown>;
}

describe('DashboardAnalyticsResponseV1 runtime validator', () => {
  it.each([
    ['default', defaultFixture],
    ['empty', emptyFixture],
    ['partial coverage', partialFixture],
    ['authority mix', authorityMixFixture],
  ])('accepts the %s golden fixture', (_name, fixture) => {
    expect(validateDashboardAnalyticsResponseV1(fixture).success).toBe(true);
  });

  it('rejects a wrong schemaVersion', () => {
    const value = cloneRecord(defaultFixture);
    value.schemaVersion = 2;
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it('rejects an invalid range', () => {
    const value = cloneRecord(defaultFixture);
    nestedRecord(value, 'scope').range = '14d';
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it('rejects an invalid enum', () => {
    const value = cloneRecord(defaultFixture);
    const recent = value.recentAttempts;
    if (!Array.isArray(recent) || typeof recent[0] !== 'object' || recent[0] === null) throw new Error('Missing recent attempt');
    (recent[0] as Record<string, unknown>).submissionOrigin = 'UNKNOWN';
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it.each([Number.NaN, -1])('rejects invalid count %s', (invalidCount) => {
    const value = cloneRecord(defaultFixture);
    nestedRecord(value, 'summary').totalDurationSeconds = invalidCount;
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it('rejects accuracy above 100', () => {
    const value = cloneRecord(defaultFixture);
    const topics = value.topics;
    if (!Array.isArray(topics) || typeof topics[0] !== 'object' || topics[0] === null) throw new Error('Missing topic');
    (topics[0] as Record<string, unknown>).accuracy = 100.01;
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it('rejects a score outside the 0..10 contract', () => {
    const value = cloneRecord(defaultFixture);
    const trend = value.trend;
    if (!Array.isArray(trend) || typeof trend[0] !== 'object' || trend[0] === null) throw new Error('Missing trend point');
    (trend[0] as Record<string, unknown>).score = 10.01;
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it('rejects a missing required array', () => {
    const value = cloneRecord(defaultFixture);
    delete value.trend;
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it('rejects inconsistent coverage', () => {
    const value = cloneRecord(defaultFixture);
    nestedRecord(value, 'coverage').detailedAttemptCount = 5;
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });

  it('rejects unknown raw payload fields', () => {
    const value = cloneRecord(defaultFixture);
    value.result_json = { answers: ['not-allowed'] };
    expect(validateDashboardAnalyticsResponseV1(value).success).toBe(false);
  });
});
