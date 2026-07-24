import { describe, expect, it } from 'vitest';
import authorityMixFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-authority-mix.json';
import defaultFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-default.json';
import emptyFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-empty.json';
import partialFixture from '../../../../../data/dashboard-analytics-fixtures/response-v1-partial-coverage.json';
import type { DashboardAnalyticsResponseV1 } from '../dashboardAnalyticsTypes';
import { validateDashboardAnalyticsResponseV1 } from '../dashboardAnalyticsValidation';
import { mapDashboardAnalyticsToViewModel } from '../dashboardMappers';

function validated(value: unknown): DashboardAnalyticsResponseV1 {
  const result = validateDashboardAnalyticsResponseV1(value);
  if (!result.success) throw new Error(result.issues.join(', '));
  return result.data;
}

describe('DashboardAnalyticsResponseV1 to ViewModel mapper', () => {
  it('maps the default response to a ready backend ViewModel', () => {
    const viewModel = mapDashboardAnalyticsToViewModel(validated(defaultFixture));
    expect(viewModel.state).toBe('ready');
    expect(viewModel.scope.source).toBe('backend');
    expect(viewModel.scope.isAuthenticated).toBe(true);
    expect(viewModel.summary.totalAttempts).toBe(4);
    expect(viewModel.strengths.map((item) => item.key)).toEqual(['cach-mang-thang-tam-1945']);
    expect(viewModel.weaknesses.map((item) => item.key)).toEqual(['viet-nam-1945-1954']);
    expect(viewModel.recommendations[0]?.topicKey).toBe('viet-nam-1945-1954');
  });

  it('maps an empty response without fabricated KPI values', () => {
    const viewModel = mapDashboardAnalyticsToViewModel(validated(emptyFixture));
    expect(viewModel.state).toBe('empty');
    expect(viewModel.summary.averageScore).toBeNull();
    expect(viewModel.scoreTrend.points).toEqual([]);
    expect(viewModel.recommendations[0]).toMatchObject({
      id: 'start-first-exam',
      actionRoute: '/exams/browse',
      evidence: null,
    });
  });

  it('maps partial coverage to an incomplete trend and explicit notices', () => {
    const viewModel = mapDashboardAnalyticsToViewModel(validated(partialFixture));
    expect(viewModel.scoreTrend.isComplete).toBe(false);
    expect(viewModel.coverage.isComplete).toBe(false);
    expect(viewModel.notices.map((notice) => notice.id)).toEqual([
      'partial-detail',
      'unsupported-detail',
    ]);
  });

  it('maps authority mix to recovered and legacy notices', () => {
    const viewModel = mapDashboardAnalyticsToViewModel(validated(authorityMixFixture));
    expect(viewModel.notices.map((notice) => notice.id)).toEqual([
      'partial-detail',
      'recovered-attempts',
      'legacy-summary',
    ]);
    expect(viewModel.notices.find((notice) => notice.id === 'legacy-summary')?.message).toContain(
      'chỉ đóng góp KPI và xu hướng',
    );
  });

  it('maps backend modes, labels, timestamps and result routes without raw enum leakage', () => {
    const viewModel = mapDashboardAnalyticsToViewModel(validated(defaultFixture));
    expect(viewModel.scoreTrend.points[0]).toMatchObject({
      mode: 'custom_mock',
      dateLabel: '24/06',
    });
    expect(viewModel.recentAttempts[0]).toMatchObject({
      mode: 'thi_thu',
      modeLabel: 'Thi thử nguyên đề',
      resultRoute: '/exams/ket-qua/golden-attempt-004',
    });
    expect(viewModel.questionTypePerformance.map((item) => item.label)).toEqual([
      'Trắc nghiệm',
      'Đúng/Sai theo mệnh đề',
    ]);
    expect(viewModel.cognitivePerformance.map((item) => item.label)).toEqual([
      'Nhận biết',
      'Thông hiểu',
      'Vận dụng',
    ]);
    expect(JSON.stringify(viewModel)).not.toContain('TIMED_ORIGINAL');
    expect(JSON.stringify(viewModel)).not.toContain('CUSTOM_MOCK');
  });

  it('orders equal-accuracy weaknesses by larger totalUnits', () => {
    const response = validated(defaultFixture);
    const largerSample = {
      ...response.topics[0],
      topicKey: 'larger-sample',
      topicLabel: 'Chủ đề có mẫu lớn hơn',
      correctUnits: 31,
      totalUnits: 60,
    };
    const viewModel = mapDashboardAnalyticsToViewModel({
      ...response,
      topics: [...response.topics, largerSample],
    });
    expect(viewModel.recommendations[0]?.topicKey).toBe('larger-sample');
  });

  it('does not classify an insufficient topic as a weakness', () => {
    const response = validated(defaultFixture);
    const insufficient = response.topics.find((topic) => topic.status === 'insufficient-data');
    if (!insufficient) throw new Error('Missing insufficient topic fixture');
    const viewModel = mapDashboardAnalyticsToViewModel({
      ...response,
      topics: [insufficient],
    });
    expect(viewModel.weaknesses).toEqual([]);
    expect(viewModel.recommendations[0]?.id).toBe(`insufficient-${insufficient.topicKey}`);
    expect(viewModel.recommendations[0]?.reason).toContain('chưa đủ mẫu');
  });

  it('chooses the lowest developing topic when no weakness exists', () => {
    const response = validated(defaultFixture);
    const viewModel = mapDashboardAnalyticsToViewModel({
      ...response,
      topics: response.topics.filter((topic) => (
        topic.status === 'developing' || topic.status === 'strength'
      )),
    });
    expect(viewModel.weaknesses).toEqual([]);
    expect(viewModel.recommendations[0]).toMatchObject({
      id: 'developing-quan-he-quoc-te',
      topicKey: 'quan-he-quoc-te',
    });
  });

  it('suggests a custom mock when every available topic is strong', () => {
    const response = validated(defaultFixture);
    const viewModel = mapDashboardAnalyticsToViewModel({
      ...response,
      topics: response.topics.filter((topic) => topic.status === 'strength'),
    });
    expect(viewModel.recommendations[0]).toMatchObject({
      id: 'continue-custom-mock',
      actionRoute: '/exams/tao-de',
      topicKey: null,
    });
  });

  it('handles summary-only analytics without inventing topic or cognitive facts', () => {
    const response = validated(defaultFixture);
    const viewModel = mapDashboardAnalyticsToViewModel({
      ...response,
      topics: [],
      cognitiveLevels: [],
      questionTypes: [],
      coverage: {
        ...response.coverage,
        detailedAttemptCount: 0,
      },
    });
    expect(viewModel.strengths).toEqual([]);
    expect(viewModel.weaknesses).toEqual([]);
    expect(viewModel.cognitivePerformance).toEqual([]);
    expect(viewModel.questionTypePerformance).toEqual([]);
    expect(viewModel.notices.some((notice) => notice.id === 'no-detailed-analytics')).toBe(true);
  });

  it('does not mutate the wire response', () => {
    const response = validated(defaultFixture);
    const before = structuredClone(response);
    mapDashboardAnalyticsToViewModel(response);
    expect(response).toEqual(before);
  });

  it('validates and maps the maximum bounded response without mutation or raw fields', () => {
    const base = validated(defaultFixture);
    const maximum = {
      ...base,
      summary: {
        ...base.summary,
        totalAttempts: 500,
        officialAttemptCount: 500,
        recoveredAttemptCount: 0,
        legacyAttemptCount: 0,
      },
      trend: Array.from({ length: 50 }, (_, index) => ({
        ...base.trend[index % base.trend.length]!,
        attemptId: `synthetic-trend-${index}`,
      })),
      topics: Array.from({ length: 34 }, (_, index) => ({
        ...base.topics[index % base.topics.length]!,
        topicKey: `synthetic-topic-${index}`,
        topicLabel: `Synthetic topic ${index}`,
      })),
      recentAttempts: Array.from({ length: 10 }, (_, index) => ({
        ...base.recentAttempts[index % base.recentAttempts.length]!,
        attemptId: `synthetic-recent-${index}`,
      })),
      coverage: {
        totalKnownAttempts: 500,
        fetchedAttemptCount: 500,
        summaryAttemptCount: 500,
        detailedAttemptCount: 500,
        unsupportedSnapshotCount: 0,
        malformedDetailCount: 0,
        legacySummaryCount: 0,
        fetchLimit: 500,
        isComplete: true,
      },
      authorityBreakdown: {
        backendOnTime: 500,
        backendLate: 0,
        backendFallback: 0,
        frontendLegacy: 0,
      },
      diagnostics: {
        snapshotVersionCounts: { 2: 500 },
        excludedModeCount: 0,
        excludedInvalidSummaryCount: 0,
      },
    };
    const validation = validateDashboardAnalyticsResponseV1(maximum);
    expect(validation.success).toBe(true);
    if (!validation.success) return;

    const before = JSON.stringify(validation.data);
    const viewModel = mapDashboardAnalyticsToViewModel(validation.data);
    expect(JSON.stringify(validation.data)).toBe(before);
    expect(viewModel.summary.totalAttempts).toBe(500);
    expect(viewModel.scoreTrend.points).toHaveLength(50);
    expect(viewModel.recentAttempts).toHaveLength(10);
    expect(JSON.stringify(viewModel)).not.toMatch(
      /userAnswer|correctAnswer|resultJson|answersJson|questionSnapshots|rawSnapshot/,
    );
  });
});
