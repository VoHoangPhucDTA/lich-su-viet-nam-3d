import { describe, expect, it } from 'vitest';
import { mapLocalDashboardAnalyticsToViewModel } from '../localDashboardMappers';
import { dashboardAiPracticeRoute } from '../../dashboardRecommendation';
import type { LocalDashboardAnalyticsResultV1 } from '../localDashboardTypes';

function facts(overrides: Partial<LocalDashboardAnalyticsResultV1> = {}): LocalDashboardAnalyticsResultV1 {
  return {
    policyVersion: 'dashboard-v1',
    generatedAt: '2026-07-24T05:00:00.000Z',
    scope: {
      range: '30d',
      timezone: 'Asia/Ho_Chi_Minh',
      fromDate: '2026-06-25',
      toDateExclusive: '2026-07-25',
      ownerFilter: 'anonymous',
    },
    summary: {
      totalAttempts: 1,
      averageScore: 5,
      highestScore: 5,
      latestScore: 5,
      totalDurationSeconds: 600,
      activeDays: 1,
      mcqAccuracy: 50,
      tfStatementAccuracy: null,
      blankRate: 0,
      tfPartialRate: null,
    },
    trend: [{
      attemptId: 'local/attempt 1',
      submittedAt: '2026-07-20T03:00:00.000Z',
      score: 5,
      mode: 'TIMED_ORIGINAL',
      title: 'Synthetic local attempt',
    }],
    topics: [
      {
        key: 'needs-review', label: 'Needs review', accuracy: 50, correctUnits: 4, totalUnits: 8,
        attemptCount: 2, confidence: 'low', status: 'weakness',
      },
      {
        key: 'too-little-data', label: 'Too little data', accuracy: 0, correctUnits: 0, totalUnits: 2,
        attemptCount: 1, confidence: 'low', status: 'insufficient-data',
      },
    ],
    cognitiveLevels: [],
    questionTypes: [{
      type: 'mcq', accuracy: 50, correctUnits: 1, answeredUnits: 2, blankUnits: 0,
      totalUnits: 2, partialQuestionCount: 0, totalQuestionCount: 2,
    }],
    recentAttempts: [{
      attemptId: 'local/attempt 1',
      resultRouteId: 'local/attempt 1',
      submittedAt: '2026-07-20T03:00:00.000Z',
      score: 5,
      mode: 'TIMED_ORIGINAL',
      title: 'Synthetic local attempt',
      durationSeconds: 600,
      totalQuestions: 2,
      detailStatus: 'question-type-only',
    }],
    coverage: {
      summaryAttemptCount: 1,
      detailedAttemptCount: 1,
      questionTypeAttemptCount: 1,
      topicAttemptCount: 1,
      cognitiveAttemptCount: 0,
      totalKnownAttempts: 1,
      scanLimit: 500,
      isComplete: true,
    },
    authorityBreakdown: { backendOfficial: 0, backendRecovered: 0, localFallback: 1, frontendLegacy: 0 },
    diagnostics: {
      scannedKeyCount: 1,
      scannedRecordCount: 1,
      matchingKeyCount: 1,
      supportedRecordCount: 1,
      deduplicatedRecordCount: 0,
      duplicateGroupCount: 0,
      ownerConflictCount: 0,
      malformedCount: 0,
      unsupportedCount: 0,
      oversizedCount: 0,
      storageReadErrorCount: 0,
      matchingKeyLimitReached: false,
      normalizedAttemptLimitReached: false,
      futureTimestampDroppedCount: 0,
    },
    pendingRecoveryCount: 0,
    ownerScopeBreakdown: {
      anonymous: 0,
      'authenticated-owner': 0,
      'device-legacy-unscoped': 1,
      unknown: 0,
      conflicting: 0,
    },
    excludedOwnerScopeBreakdown: {
      anonymous: 0,
      'authenticated-owner': 0,
      'device-legacy-unscoped': 0,
      unknown: 0,
      conflicting: 0,
    },
    sourceBreakdown: { 'v2-result': 1 },
    ...overrides,
  };
}

describe('local dashboard ViewModel mapper', () => {
  it('marks anonymous local facts and authenticated fallback as device-only sources', () => {
    const local = mapLocalDashboardAnalyticsToViewModel(facts());
    const fallback = mapLocalDashboardAnalyticsToViewModel(facts({
      scope: { ...facts().scope, ownerFilter: 'authenticated-owner' },
    }), { source: 'local-fallback' });

    expect(local.scope).toMatchObject({ source: 'local', isAuthenticated: false });
    expect(local.notices.map((notice) => notice.id)).toContain('device-only-local-analytics');
    expect(fallback.scope).toMatchObject({ source: 'local-fallback', isAuthenticated: true });
    expect(fallback.notices.map((notice) => notice.id)).toEqual(expect.arrayContaining([
      'backend-unavailable-local-fallback',
      'device-only-local-analytics',
    ]));
  });

  it('adds pending-recovery and partial-coverage notices', () => {
    const viewModel = mapLocalDashboardAnalyticsToViewModel(facts({
      pendingRecoveryCount: 2,
      coverage: { ...facts().coverage, detailedAttemptCount: 0, isComplete: false },
    }));
    expect(viewModel.notices.map((notice) => notice.id)).toEqual([
      'device-only-local-analytics', 'local-coverage-partial', 'pending-recovery',
    ]);
  });

  it('adds a notice when implausible future timestamps were excluded', () => {
    const viewModel = mapLocalDashboardAnalyticsToViewModel(facts({
      diagnostics: { ...facts().diagnostics, futureTimestampDroppedCount: 2 },
      coverage: { ...facts().coverage, isComplete: false },
    }));
    expect(viewModel.notices.map((notice) => notice.id)).toContain('future-timestamp-dropped');
  });

  it('returns the empty local state without inventing attempts', () => {
    const empty = facts({
      summary: { ...facts().summary, totalAttempts: 0, averageScore: null, highestScore: null, latestScore: null },
      trend: [],
      recentAttempts: [],
      topics: [],
      coverage: { ...facts().coverage, summaryAttemptCount: 0, detailedAttemptCount: 0, totalKnownAttempts: 0 },
    });
    const viewModel = mapLocalDashboardAnalyticsToViewModel(empty);
    expect(viewModel.state).toBe('empty');
    expect(viewModel.recentAttempts).toEqual([]);
    expect(viewModel.recommendations[0]?.actionRoute).toBe('/exams/browse');
  });

  it('does not turn insufficient evidence into a weakness and produces encoded action routes', () => {
    const viewModel = mapLocalDashboardAnalyticsToViewModel(facts());
    expect(viewModel.weaknesses.map((topic) => topic.key)).toEqual(['needs-review']);
    expect(viewModel.recommendations[0]?.actionRoute).toBe('/exams/on-chu-de/needs-review');
    expect(viewModel.recommendations[0]).toMatchObject({
      aiActionLabel: 'Tạo bài AI theo gợi ý',
      aiActionRoute: dashboardAiPracticeRoute('Needs review'),
    });
    expect(viewModel.recentAttempts[0]?.resultRoute).toBe('/exams/ket-qua/local%2Fattempt%201');
    expect(viewModel.recentAttempts[0]?.detailStatus).toBe('summary-only');
  });

  it('does not create an AI CTA for insufficient evidence', () => {
    const viewModel = mapLocalDashboardAnalyticsToViewModel(facts({
      topics: [{
        key: 'too-little-data', label: 'Too little data', accuracy: 0, correctUnits: 0, totalUnits: 2,
        attemptCount: 1, confidence: 'low', status: 'insufficient-data',
      }],
    }));
    expect(viewModel.recommendations[0]?.actionRoute).toBe('/exams/browse');
    expect(viewModel.recommendations[0]?.aiActionRoute).toBeUndefined();
  });

  it('does not leak raw local enums or label local authority as official', () => {
    const serialized = JSON.stringify(mapLocalDashboardAnalyticsToViewModel(facts()));
    expect(serialized).not.toContain('TIMED_ORIGINAL');
    expect(serialized.toLocaleLowerCase('vi-VN')).not.toContain('official');
    expect(serialized).not.toContain('LOCAL_FALLBACK');
  });

  it('does not mutate local facts', () => {
    const input = facts();
    const before = structuredClone(input);
    mapLocalDashboardAnalyticsToViewModel(input);
    expect(input).toEqual(before);
  });
});
