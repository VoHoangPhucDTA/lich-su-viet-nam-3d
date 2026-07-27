import {
  DASHBOARD_ANALYTICS_MODES,
  DASHBOARD_ANALYTICS_POLICY_VERSION,
  classifyDashboardInsight,
  dashboardConfidence,
} from './dashboardAnalyticsPolicy';
import type {
  DashboardAnalyticsRange,
  DashboardAnalyticsResponseV1,
  DashboardAttemptAuthorityV1,
  DashboardBackendMode,
  DashboardCognitiveAnalyticsV1,
  DashboardCognitiveLevel,
  DashboardConfidence,
  DashboardDetailStatus,
  DashboardInsightStatus,
  DashboardQuestionType,
  DashboardQuestionTypeAnalyticsV1,
  DashboardRecentAttemptV1,
  DashboardScoreAuthority,
  DashboardSubmissionOrigin,
  DashboardTimingAuthority,
  DashboardTopicAnalyticsV1,
  DashboardTrendPointV1,
} from './dashboardAnalyticsTypes';

export type DashboardAnalyticsValidationResult =
  | { success: true; data: DashboardAnalyticsResponseV1 }
  | { success: false; issues: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isNullableBoundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number | null {
  return value === null || isBoundedNumber(value, minimum, maximum);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(value);
}

function parseRange(value: unknown): DashboardAnalyticsRange | null {
  if (value === '7d' || value === '30d' || value === '90d' || value === 'all') return value;
  return null;
}

function parseMode(value: unknown): DashboardBackendMode | null {
  if (value === 'TIMED_ORIGINAL' || value === 'CUSTOM_MOCK') return value;
  return null;
}

function parseConfidence(value: unknown): DashboardConfidence | null {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return null;
}

function parseInsightStatus(value: unknown): DashboardInsightStatus | null {
  if (value === 'strength' || value === 'developing' || value === 'weakness' || value === 'insufficient-data') {
    return value;
  }
  return null;
}

function parseCognitiveLevel(value: unknown): DashboardCognitiveLevel | null {
  if (value === 'knowledge' || value === 'comprehension' || value === 'application') return value;
  return null;
}

function parseQuestionType(value: unknown): DashboardQuestionType | null {
  if (value === 'mcq' || value === 'true_false') return value;
  return null;
}

function parseDetailStatus(value: unknown): DashboardDetailStatus | null {
  if (value === 'full' || value === 'summary-only' || value === 'unavailable') return value;
  return null;
}

function parseScoreAuthority(value: unknown): DashboardScoreAuthority | null {
  if (value === 'BACKEND' || value === 'FRONTEND_LEGACY') return value;
  return null;
}

function parseTimingAuthority(value: unknown): DashboardTimingAuthority | null {
  if (value === 'SERVER' || value === 'CLIENT_UNVERIFIED' || value === 'LOCAL') return value;
  return null;
}

function parseSubmissionOrigin(value: unknown): DashboardSubmissionOrigin | null {
  if (
    value === 'SERVER_ON_TIME'
    || value === 'SERVER_ISSUED_LATE'
    || value === 'CLIENT_FALLBACK'
    || value === 'LOCAL_FALLBACK'
  ) {
    return value;
  }
  return null;
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: T[] = [];
  for (const item of value) {
    const result = parser(item);
    if (result === null) return null;
    parsed.push(result);
  }
  return parsed;
}

function parseAuthority(value: Record<string, unknown>): DashboardAttemptAuthorityV1 | null {
  const scoreAuthority = parseScoreAuthority(value.scoreAuthority);
  const timingAuthority = parseTimingAuthority(value.timingAuthority);
  const submissionOrigin = parseSubmissionOrigin(value.submissionOrigin);
  if (!scoreAuthority || !timingAuthority || !submissionOrigin) return null;
  return { scoreAuthority, timingAuthority, submissionOrigin };
}

function parseTrendPoint(value: unknown): DashboardTrendPointV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ['attemptId', 'submittedAt', 'score', 'mode', 'title'])
  ) {
    return null;
  }
  const mode = parseMode(value.mode);
  if (
    !isNonEmptyString(value.attemptId)
    || !isIsoTimestamp(value.submittedAt)
    || !isBoundedNumber(value.score, 0, 10)
    || !mode
    || !isNonEmptyString(value.title)
  ) {
    return null;
  }
  return {
    attemptId: value.attemptId,
    submittedAt: value.submittedAt,
    score: value.score,
    mode,
    title: value.title,
  };
}

function parseTopic(value: unknown): DashboardTopicAnalyticsV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'topicKey',
      'topicLabel',
      'accuracy',
      'correctUnits',
      'totalUnits',
      'attemptCount',
      'confidence',
      'status',
    ])
  ) {
    return null;
  }
  const confidence = parseConfidence(value.confidence);
  const status = parseInsightStatus(value.status);
  if (
    !isNonEmptyString(value.topicKey)
    || !isNonEmptyString(value.topicLabel)
    || !isBoundedNumber(value.accuracy, 0, 100)
    || !isCount(value.correctUnits)
    || !isCount(value.totalUnits)
    || !isCount(value.attemptCount)
    || value.correctUnits > value.totalUnits
    || !confidence
    || !status
  ) {
    return null;
  }
  const sample = {
    accuracy: value.accuracy,
    totalUnits: value.totalUnits,
    attemptCount: value.attemptCount,
  };
  if (status !== classifyDashboardInsight(sample) || confidence !== dashboardConfidence(sample)) return null;
  return {
    topicKey: value.topicKey,
    topicLabel: value.topicLabel,
    accuracy: value.accuracy,
    correctUnits: value.correctUnits,
    totalUnits: value.totalUnits,
    attemptCount: value.attemptCount,
    confidence,
    status,
  };
}

function parseCognitive(value: unknown): DashboardCognitiveAnalyticsV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'level',
      'accuracy',
      'correctUnits',
      'totalUnits',
      'attemptCount',
      'confidence',
      'status',
    ])
  ) {
    return null;
  }
  const level = parseCognitiveLevel(value.level);
  const confidence = parseConfidence(value.confidence);
  const status = parseInsightStatus(value.status);
  if (
    !level
    || !isNullableBoundedNumber(value.accuracy, 0, 100)
    || !isCount(value.correctUnits)
    || !isCount(value.totalUnits)
    || !isCount(value.attemptCount)
    || value.correctUnits > value.totalUnits
    || !confidence
    || !status
  ) {
    return null;
  }
  const sample = {
    accuracy: value.accuracy,
    totalUnits: value.totalUnits,
    attemptCount: value.attemptCount,
  };
  if (status !== classifyDashboardInsight(sample) || confidence !== dashboardConfidence(sample)) return null;
  return {
    level,
    accuracy: value.accuracy,
    correctUnits: value.correctUnits,
    totalUnits: value.totalUnits,
    attemptCount: value.attemptCount,
    confidence,
    status,
  };
}

function parseQuestionTypeAnalytics(value: unknown): DashboardQuestionTypeAnalyticsV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'type',
      'accuracy',
      'correctUnits',
      'answeredUnits',
      'blankUnits',
      'totalUnits',
      'partialQuestionCount',
      'totalQuestionCount',
    ])
  ) {
    return null;
  }
  const type = parseQuestionType(value.type);
  if (
    !type
    || !isNullableBoundedNumber(value.accuracy, 0, 100)
    || !isCount(value.correctUnits)
    || !isCount(value.answeredUnits)
    || !isCount(value.blankUnits)
    || !isCount(value.totalUnits)
    || !isCount(value.partialQuestionCount)
    || !isCount(value.totalQuestionCount)
    || value.correctUnits > value.answeredUnits
    || value.answeredUnits > value.totalUnits
    || value.answeredUnits + value.blankUnits !== value.totalUnits
    || value.partialQuestionCount > value.totalQuestionCount
  ) {
    return null;
  }
  return {
    type,
    accuracy: value.accuracy,
    correctUnits: value.correctUnits,
    answeredUnits: value.answeredUnits,
    blankUnits: value.blankUnits,
    totalUnits: value.totalUnits,
    partialQuestionCount: value.partialQuestionCount,
    totalQuestionCount: value.totalQuestionCount,
  };
}

function parseRecentAttempt(value: unknown): DashboardRecentAttemptV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'attemptId',
      'title',
      'mode',
      'score',
      'durationSeconds',
      'submittedAt',
      'totalQuestions',
      'detailStatus',
      'scoreAuthority',
      'timingAuthority',
      'submissionOrigin',
    ])
  ) {
    return null;
  }
  const mode = parseMode(value.mode);
  const detailStatus = parseDetailStatus(value.detailStatus);
  const authority = parseAuthority(value);
  if (
    !isNonEmptyString(value.attemptId)
    || !isNonEmptyString(value.title)
    || !mode
    || !isBoundedNumber(value.score, 0, 10)
    || !isCount(value.durationSeconds)
    || !isIsoTimestamp(value.submittedAt)
    || !isCount(value.totalQuestions)
    || !detailStatus
    || !authority
  ) {
    return null;
  }
  return {
    attemptId: value.attemptId,
    title: value.title,
    mode,
    score: value.score,
    durationSeconds: value.durationSeconds,
    submittedAt: value.submittedAt,
    totalQuestions: value.totalQuestions,
    detailStatus,
    ...authority,
  };
}

function parseSnapshotVersionCounts(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!key || !isCount(count)) return null;
    result[key] = count;
  }
  return result;
}

function parseResponse(value: unknown): DashboardAnalyticsResponseV1 | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'schemaVersion',
      'generatedAt',
      'scope',
      'summary',
      'trend',
      'topics',
      'cognitiveLevels',
      'questionTypes',
      'recentAttempts',
      'coverage',
      'authorityBreakdown',
      'diagnostics',
    ])
    || value.schemaVersion !== 1
    || !isIsoTimestamp(value.generatedAt)
  ) {
    return null;
  }
  if (
    !isRecord(value.scope)
    || !isRecord(value.summary)
    || !isRecord(value.coverage)
    || !isRecord(value.authorityBreakdown)
    || !isRecord(value.diagnostics)
    || !hasExactKeys(value.scope, [
      'range',
      'timezone',
      'fromDate',
      'toDateExclusive',
      'attemptModes',
      'policyVersion',
    ])
    || !hasExactKeys(value.summary, [
      'totalAttempts',
      'officialAttemptCount',
      'recoveredAttemptCount',
      'legacyAttemptCount',
      'averageScore',
      'highestScore',
      'latestScore',
      'totalDurationSeconds',
      'activeDays',
      'mcqAccuracy',
      'tfStatementAccuracy',
      'blankRate',
      'tfPartialRate',
    ])
    || !hasExactKeys(value.coverage, [
      'totalKnownAttempts',
      'fetchedAttemptCount',
      'summaryAttemptCount',
      'detailedAttemptCount',
      'unsupportedSnapshotCount',
      'malformedDetailCount',
      'legacySummaryCount',
      'fetchLimit',
      'isComplete',
    ])
    || !hasExactKeys(value.authorityBreakdown, [
      'backendOnTime',
      'backendLate',
      'backendFallback',
      'frontendLegacy',
    ])
    || !hasExactKeys(value.diagnostics, [
      'snapshotVersionCounts',
      'excludedModeCount',
      'excludedInvalidSummaryCount',
    ])
  ) {
    return null;
  }

  const range = parseRange(value.scope.range);
  const attemptModes = parseArray(value.scope.attemptModes, parseMode);
  if (
    !range
    || value.scope.timezone !== 'Asia/Ho_Chi_Minh'
    || !(value.scope.fromDate === null || isCalendarDate(value.scope.fromDate))
    || !isCalendarDate(value.scope.toDateExclusive)
    || value.scope.policyVersion !== DASHBOARD_ANALYTICS_POLICY_VERSION
    || !attemptModes
    || attemptModes.length !== DASHBOARD_ANALYTICS_MODES.length
    || new Set(attemptModes).size !== DASHBOARD_ANALYTICS_MODES.length
    || !DASHBOARD_ANALYTICS_MODES.every((mode) => attemptModes.includes(mode))
  ) {
    return null;
  }

  const summary = value.summary;
  if (
    !isCount(summary.totalAttempts)
    || !isCount(summary.officialAttemptCount)
    || !isCount(summary.recoveredAttemptCount)
    || !isCount(summary.legacyAttemptCount)
    || summary.totalAttempts !== summary.officialAttemptCount + summary.recoveredAttemptCount + summary.legacyAttemptCount
    || !isNullableBoundedNumber(summary.averageScore, 0, 10)
    || !isNullableBoundedNumber(summary.highestScore, 0, 10)
    || !isNullableBoundedNumber(summary.latestScore, 0, 10)
    || !isCount(summary.totalDurationSeconds)
    || !isCount(summary.activeDays)
    || !isNullableBoundedNumber(summary.mcqAccuracy, 0, 100)
    || !isNullableBoundedNumber(summary.tfStatementAccuracy, 0, 100)
    || !isNullableBoundedNumber(summary.blankRate, 0, 100)
    || !isNullableBoundedNumber(summary.tfPartialRate, 0, 100)
  ) {
    return null;
  }

  const trend = parseArray(value.trend, parseTrendPoint);
  const topics = parseArray(value.topics, parseTopic);
  const cognitiveLevels = parseArray(value.cognitiveLevels, parseCognitive);
  const questionTypes = parseArray(value.questionTypes, parseQuestionTypeAnalytics);
  const recentAttempts = parseArray(value.recentAttempts, parseRecentAttempt);
  if (!trend || !topics || !cognitiveLevels || !questionTypes || !recentAttempts) return null;

  const coverage = value.coverage;
  if (
    !isCount(coverage.totalKnownAttempts)
    || !isCount(coverage.fetchedAttemptCount)
    || !isCount(coverage.summaryAttemptCount)
    || !isCount(coverage.detailedAttemptCount)
    || !isCount(coverage.unsupportedSnapshotCount)
    || !isCount(coverage.malformedDetailCount)
    || !isCount(coverage.legacySummaryCount)
    || !isCount(coverage.fetchLimit)
    || typeof coverage.isComplete !== 'boolean'
    || coverage.fetchedAttemptCount > coverage.totalKnownAttempts
    || coverage.summaryAttemptCount > coverage.fetchedAttemptCount
    || coverage.detailedAttemptCount > coverage.summaryAttemptCount
    || coverage.summaryAttemptCount !== summary.totalAttempts
    || coverage.legacySummaryCount !== summary.legacyAttemptCount
    || (coverage.isComplete && coverage.fetchedAttemptCount !== coverage.totalKnownAttempts)
  ) {
    return null;
  }

  const authority = value.authorityBreakdown;
  if (
    !isCount(authority.backendOnTime)
    || !isCount(authority.backendLate)
    || !isCount(authority.backendFallback)
    || !isCount(authority.frontendLegacy)
    || authority.backendOnTime !== summary.officialAttemptCount
    || authority.backendLate + authority.backendFallback !== summary.recoveredAttemptCount
    || authority.frontendLegacy !== summary.legacyAttemptCount
    || authority.backendOnTime + authority.backendLate + authority.backendFallback + authority.frontendLegacy !== summary.totalAttempts
  ) {
    return null;
  }

  const snapshotVersionCounts = parseSnapshotVersionCounts(value.diagnostics.snapshotVersionCounts);
  if (
    !snapshotVersionCounts
    || !isCount(value.diagnostics.excludedModeCount)
    || !isCount(value.diagnostics.excludedInvalidSummaryCount)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    scope: {
      range,
      timezone: 'Asia/Ho_Chi_Minh',
      fromDate: value.scope.fromDate,
      toDateExclusive: value.scope.toDateExclusive,
      attemptModes,
      policyVersion: DASHBOARD_ANALYTICS_POLICY_VERSION,
    },
    summary: {
      totalAttempts: summary.totalAttempts,
      officialAttemptCount: summary.officialAttemptCount,
      recoveredAttemptCount: summary.recoveredAttemptCount,
      legacyAttemptCount: summary.legacyAttemptCount,
      averageScore: summary.averageScore,
      highestScore: summary.highestScore,
      latestScore: summary.latestScore,
      totalDurationSeconds: summary.totalDurationSeconds,
      activeDays: summary.activeDays,
      mcqAccuracy: summary.mcqAccuracy,
      tfStatementAccuracy: summary.tfStatementAccuracy,
      blankRate: summary.blankRate,
      tfPartialRate: summary.tfPartialRate,
    },
    trend,
    topics,
    cognitiveLevels,
    questionTypes,
    recentAttempts,
    coverage: {
      totalKnownAttempts: coverage.totalKnownAttempts,
      fetchedAttemptCount: coverage.fetchedAttemptCount,
      summaryAttemptCount: coverage.summaryAttemptCount,
      detailedAttemptCount: coverage.detailedAttemptCount,
      unsupportedSnapshotCount: coverage.unsupportedSnapshotCount,
      malformedDetailCount: coverage.malformedDetailCount,
      legacySummaryCount: coverage.legacySummaryCount,
      fetchLimit: coverage.fetchLimit,
      isComplete: coverage.isComplete,
    },
    authorityBreakdown: {
      backendOnTime: authority.backendOnTime,
      backendLate: authority.backendLate,
      backendFallback: authority.backendFallback,
      frontendLegacy: authority.frontendLegacy,
    },
    diagnostics: {
      snapshotVersionCounts,
      excludedModeCount: value.diagnostics.excludedModeCount,
      excludedInvalidSummaryCount: value.diagnostics.excludedInvalidSummaryCount,
    },
  };
}

export function validateDashboardAnalyticsResponseV1(value: unknown): DashboardAnalyticsValidationResult {
  const data = parseResponse(value);
  return data
    ? { success: true, data }
    : { success: false, issues: ['Response không khớp Dashboard Analytics API contract V1.'] };
}

export function isDashboardAnalyticsResponseV1(value: unknown): value is DashboardAnalyticsResponseV1 {
  return parseResponse(value) !== null;
}
