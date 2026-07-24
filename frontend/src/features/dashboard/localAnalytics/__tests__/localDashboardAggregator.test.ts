import { describe, expect, it } from 'vitest';
import { buildLocalDashboardAnalytics } from '../localDashboardAggregator';
import type {
  LocalDashboardAttemptV1,
  LocalDashboardQuestionEvidence,
  LocalDashboardScanResult,
} from '../localDashboardTypes';

const NOW = new Date('2026-07-24T05:00:00.000Z');

function question(overrides: Partial<LocalDashboardQuestionEvidence> = {}): LocalDashboardQuestionEvidence {
  return {
    questionId: 'q1',
    questionType: 'mcq',
    completionState: 'COMPLETE',
    correctUnits: 1,
    answeredUnits: 1,
    blankUnits: 0,
    totalUnits: 1,
    topicRefs: [{ key: 'topic-a', label: 'Topic A', periodKey: null, periodLabel: null }],
    cognitiveLevel: 'knowledge',
    ...overrides,
  };
}

function attempt(id: string, overrides: Partial<LocalDashboardAttemptV1> = {}): LocalDashboardAttemptV1 {
  return {
    stableId: id,
    sourceKind: 'v2-result',
    sourcePriority: 500,
    sessionId: id,
    localSessionId: id,
    serverSessionId: null,
    clientSubmissionId: null,
    ownerScope: 'device-legacy-unscoped',
    ownerKey: null,
    mode: 'TIMED_ORIGINAL',
    title: `Attempt ${id}`,
    totalScore: 5,
    durationSeconds: 600,
    submittedAt: Date.parse('2026-07-20T03:00:00.000Z'),
    totalQuestions: 1,
    scoreAuthority: 'LOCAL_FALLBACK',
    timingAuthority: 'CLIENT_UNVERIFIED',
    submissionOrigin: 'CLIENT_FALLBACK',
    datasetVersion: null,
    examContentHash: null,
    detailStatus: 'full',
    normalizedQuestions: [question()],
    pendingRecovery: false,
    malformedReason: null,
    ...overrides,
  };
}

function scan(attempts: LocalDashboardAttemptV1[], overrides: Partial<LocalDashboardScanResult> = {}): LocalDashboardScanResult {
  return {
    attempts,
    diagnostics: {
      scannedRecordCount: attempts.length,
      matchingKeyCount: attempts.length,
      supportedRecordCount: attempts.length,
      deduplicatedRecordCount: 0,
      duplicateGroupCount: 0,
      ownerConflictCount: 0,
      malformedCount: 0,
      unsupportedCount: 0,
      oversizedCount: 0,
      storageReadErrorCount: 0,
      matchingKeyLimitReached: false,
      normalizedAttemptLimitReached: false,
    },
    pendingRecoveryCount: 0,
    ownerScopeBreakdown: {
      anonymous: 0, 'authenticated-owner': 0, 'device-legacy-unscoped': attempts.length, unknown: 0, conflicting: 0,
    },
    excludedOwnerScopeBreakdown: {
      anonymous: 0, 'authenticated-owner': 0, 'device-legacy-unscoped': 0, unknown: 0, conflicting: 0,
    },
    sourceBreakdown: { 'v2-result': attempts.length },
    ...overrides,
  };
}

describe('local dashboard analytics aggregation', () => {
  it('returns an empty local fact set without fabricated KPI values', () => {
    const result = buildLocalDashboardAnalytics(scan([]), { now: NOW });
    expect(result.summary).toMatchObject({
      totalAttempts: 0, averageScore: null, highestScore: null, latestScore: null, activeDays: 0,
    });
    expect(result.trend).toEqual([]);
    expect(result.recentAttempts).toEqual([]);
  });

  it('aggregates summary-only and detailed attempts for KPI, latest and active days', () => {
    const result = buildLocalDashboardAnalytics(scan([
      attempt('a', { totalScore: 4, submittedAt: Date.parse('2026-07-20T03:00:00Z'), normalizedQuestions: null, detailStatus: 'summary-only' }),
      attempt('b', { totalScore: 8, submittedAt: Date.parse('2026-07-21T03:00:00Z') }),
    ]), { now: NOW });
    expect(result.summary).toMatchObject({
      totalAttempts: 2, averageScore: 6, highestScore: 8, latestScore: 8, totalDurationSeconds: 1200, activeDays: 2,
    });
    expect(result.coverage).toMatchObject({ summaryAttemptCount: 2, detailedAttemptCount: 1 });
  });

  it('uses MCQ question units and T/F statement units with blank/partial semantics', () => {
    const result = buildLocalDashboardAnalytics(scan([attempt('deep', {
      totalQuestions: 3,
      normalizedQuestions: [
        question({ questionId: 'mcq-correct' }),
        question({ questionId: 'mcq-blank', completionState: 'BLANK', correctUnits: 0, answeredUnits: 0, blankUnits: 1 }),
        question({
          questionId: 'tf-partial', questionType: 'true_false', completionState: 'PARTIAL',
          correctUnits: 1, answeredUnits: 2, blankUnits: 2, totalUnits: 4,
        }),
      ],
    })]), { now: NOW });
    expect(result.summary).toMatchObject({
      mcqAccuracy: 50, tfStatementAccuracy: 25, blankRate: 33.33, tfPartialRate: 100,
    });
    expect(result.questionTypes).toEqual([
      expect.objectContaining({ type: 'mcq', correctUnits: 1, answeredUnits: 1, blankUnits: 1, totalUnits: 2 }),
      expect.objectContaining({ type: 'true_false', correctUnits: 1, answeredUnits: 2, blankUnits: 2, totalUnits: 4, partialQuestionCount: 1 }),
    ]);
  });

  it('supports multi-topic evidence and distinct attempt count', () => {
    const multi = question({
      totalUnits: 4,
      correctUnits: 3,
      topicRefs: [
        { key: 'topic-a', label: 'Topic A', periodKey: null, periodLabel: null },
        { key: 'topic-b', label: 'Topic B', periodKey: null, periodLabel: null },
      ],
    });
    const result = buildLocalDashboardAnalytics(scan([
      attempt('a', { normalizedQuestions: [multi, multi] }),
      attempt('b', { normalizedQuestions: [multi] }),
    ]), { now: NOW });
    expect(result.topics).toEqual([
      expect.objectContaining({ key: 'topic-a', correctUnits: 9, totalUnits: 12, attemptCount: 2 }),
      expect.objectContaining({ key: 'topic-b', correctUnits: 9, totalUnits: 12, attemptCount: 2 }),
    ]);
  });

  it('aggregates cognitive levels without fabricating missing metadata', () => {
    const result = buildLocalDashboardAnalytics(scan([attempt('a', {
      normalizedQuestions: [
        question({ cognitiveLevel: 'knowledge' }),
        question({ questionId: 'q2', cognitiveLevel: null }),
        question({ questionId: 'q3', cognitiveLevel: 'application', correctUnits: 0 }),
      ],
    })]), { now: NOW });
    expect(result.cognitiveLevels.map((item) => item.level)).toEqual(['knowledge', 'application']);
    expect(result.coverage.cognitiveAttemptCount).toBe(1);
  });

  it.each([
    [8, 2, 7, 87.5, 'strength'],
    [8, 2, 5, 62.5, 'developing'],
    [8, 2, 4, 50, 'weakness'],
    [7, 2, 3, 42.86, 'insufficient-data'],
    [8, 1, 4, 50, 'insufficient-data'],
  ] as const)('applies threshold boundary %s units/%s attempts', (units, attemptCount, correctUnits, accuracy, status) => {
    const attempts = Array.from({ length: attemptCount }, (_, index) => attempt(`threshold-${index}`, {
      normalizedQuestions: [question({
        totalUnits: index === 0 ? units - (attemptCount - 1) : 1,
        correctUnits: index === 0 ? Math.max(0, correctUnits - (attemptCount - 1)) : 1,
      })],
    }));
    const result = buildLocalDashboardAnalytics(scan(attempts), { now: NOW });
    expect(result.topics[0]).toMatchObject({ accuracy, status });
  });

  it.each([
    [16, 3, 'medium'],
    [30, 5, 'high'],
  ] as const)('applies confidence boundary %s units/%s attempts', (units, count, confidence) => {
    const attempts = Array.from({ length: count }, (_, index) => attempt(`confidence-${index}`, {
      normalizedQuestions: [question({ totalUnits: index === 0 ? units - (count - 1) : 1, correctUnits: 1 })],
    }));
    const result = buildLocalDashboardAnalytics(scan(attempts), { now: NOW });
    expect(result.topics[0].confidence).toBe(confidence);
  });

  it('caps trend at 50 ascending points and recent attempts at 5 descending items', () => {
    const attempts = Array.from({ length: 60 }, (_, index) => attempt(`attempt-${index.toString().padStart(2, '0')}`, {
      submittedAt: Date.parse('2026-07-01T00:00:00Z') + index * 60_000,
    }));
    const result = buildLocalDashboardAnalytics(scan(attempts), { range: 'all', now: NOW });
    expect(result.trend).toHaveLength(50);
    expect(result.trend[0].attemptId).toBe('attempt-10');
    expect(result.trend.at(-1)?.attemptId).toBe('attempt-59');
    expect(result.recentAttempts).toHaveLength(5);
    expect(result.recentAttempts[0].attemptId).toBe('attempt-59');
  });

  it('filters calendar range using Asia/Ho_Chi_Minh boundaries', () => {
    const result = buildLocalDashboardAnalytics(scan([
      attempt('inside', { submittedAt: Date.parse('2026-07-17T17:00:00Z') }),
      attempt('outside', { submittedAt: Date.parse('2026-07-17T16:59:59Z') }),
    ]), { range: '7d', now: NOW });
    expect(result.scope).toMatchObject({ fromDate: '2026-07-18', toDateExclusive: '2026-07-25' });
    expect(result.summary.totalAttempts).toBe(1);
  });

  it.each([
    ['30d', '2026-06-24T17:00:00Z', '2026-06-24T16:59:59Z'],
    ['90d', '2026-04-25T17:00:00Z', '2026-04-25T16:59:59Z'],
  ] as const)('uses the inclusive %s lower calendar boundary', (range, inside, outside) => {
    const result = buildLocalDashboardAnalytics(scan([
      attempt('inside', { submittedAt: Date.parse(inside) }),
      attempt('outside', { submittedAt: Date.parse(outside) }),
    ]), { range, now: NOW });
    expect(result.summary.totalAttempts).toBe(1);
    expect(result.recentAttempts[0]?.attemptId).toBe('inside');
  });

  it('keeps all historical attempts for all while excluding future timestamps', () => {
    const result = buildLocalDashboardAnalytics(scan([
      attempt('historical', { submittedAt: Date.parse('2010-01-01T00:00:00Z') }),
      attempt('now', { submittedAt: NOW.getTime() }),
      attempt('future-today', { submittedAt: NOW.getTime() + 60_000 }),
      attempt('tomorrow', { submittedAt: Date.parse('2026-07-24T17:00:00Z') }),
    ]), { range: 'all', now: NOW });
    expect(result.recentAttempts.map((item) => item.attemptId)).toEqual(['now', 'historical']);
  });

  it('calculates active days and ordering in Asia/Ho_Chi_Minh after range filtering', () => {
    const result = buildLocalDashboardAnalytics(scan([
      attempt('day-one-a', { submittedAt: Date.parse('2026-07-20T16:59:00Z') }),
      attempt('day-two-a', { submittedAt: Date.parse('2026-07-20T17:01:00Z') }),
      attempt('day-two-b', { submittedAt: Date.parse('2026-07-21T02:00:00Z') }),
    ]), { range: '30d', now: NOW });
    expect(result.summary.activeDays).toBe(2);
    expect(result.trend.map((item) => item.attemptId)).toEqual(['day-one-a', 'day-two-a', 'day-two-b']);
    expect(result.recentAttempts.map((item) => item.attemptId)).toEqual(['day-two-b', 'day-two-a', 'day-one-a']);
  });

  it('preserves local authority and only counts exact cached backend official triples', () => {
    const result = buildLocalDashboardAnalytics(scan([
      attempt('official', { scoreAuthority: 'BACKEND', timingAuthority: 'SERVER', submissionOrigin: 'SERVER_ON_TIME' }),
      attempt('recovered', { scoreAuthority: 'BACKEND', timingAuthority: 'CLIENT_UNVERIFIED', submissionOrigin: 'CLIENT_FALLBACK' }),
      attempt('local'),
      attempt('legacy', { scoreAuthority: 'FRONTEND_LEGACY', timingAuthority: 'LOCAL', submissionOrigin: 'LOCAL_FALLBACK' }),
    ]), { now: NOW });
    expect(result.authorityBreakdown).toEqual({
      backendOfficial: 1, backendRecovered: 1, localFallback: 1, frontendLegacy: 1,
    });
  });

  it('preserves mixed-source and owner-scope scan breakdowns as diagnostics', () => {
    const source = scan([
      attempt('api', { sourceKind: 'api-snapshot-v2-cache', sourcePriority: 600 }),
      attempt('legacy', { sourceKind: 'legacy-exam-history', sourcePriority: 100 }),
    ], {
      ownerScopeBreakdown: {
        anonymous: 1, 'authenticated-owner': 0, 'device-legacy-unscoped': 1, unknown: 0, conflicting: 0,
      },
      sourceBreakdown: { 'api-snapshot-v2-cache': 1, 'legacy-exam-history': 1 },
    });
    const result = buildLocalDashboardAnalytics(source, { now: NOW });
    expect(result.sourceBreakdown).toEqual({ 'api-snapshot-v2-cache': 1, 'legacy-exam-history': 1 });
    expect(result.ownerScopeBreakdown).toMatchObject({ anonymous: 1, 'device-legacy-unscoped': 1 });
    expect(result.summary.totalAttempts).toBe(2);
  });

  it('propagates pending recovery and partial scan diagnostics without merging backend data', () => {
    const source = scan([attempt('local')], {
      pendingRecoveryCount: 2,
      diagnostics: {
        ...scan([]).diagnostics,
        scannedRecordCount: 3,
        supportedRecordCount: 1,
        malformedCount: 1,
        unsupportedCount: 1,
        oversizedCount: 0,
      },
      sourceBreakdown: { 'v2-result': 1 },
    });
    const result = buildLocalDashboardAnalytics(source, { now: NOW });
    expect(result.pendingRecoveryCount).toBe(2);
    expect(result.coverage.isComplete).toBe(false);
    expect(result.diagnostics).toMatchObject({ malformedCount: 1, unsupportedCount: 1, oversizedCount: 0 });
    expect(result.sourceBreakdown).toEqual({ 'v2-result': 1 });
  });
});
