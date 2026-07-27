import {
  classifyDashboardInsight,
  dashboardConfidence,
} from '../dashboardAnalyticsPolicy';
import type {
  BuildLocalDashboardAnalyticsOptions,
  LocalDashboardAnalyticsResultV1,
  LocalDashboardAttemptV1,
  LocalDashboardCognitiveLevel,
  LocalDashboardQuestionEvidence,
  LocalDashboardScanResult,
} from './localDashboardTypes';
import { LOCAL_DASHBOARD_POLICY_VERSION } from './localDashboardTypes';

const TIMEZONE = 'Asia/Ho_Chi_Minh' as const;
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(correct: number, total: number): number | null {
  return total > 0 ? round2((correct / total) * 100) : null;
}

function vietnamDate(value: Date | number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function startOfVietnamDate(date: string): number {
  return Date.parse(`${date}T00:00:00+07:00`);
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function rangeBoundary(range: '7d' | '30d' | '90d' | 'all', now: Date) {
  const today = vietnamDate(now);
  const toDateExclusive = addCalendarDays(today, 1);
  if (range === 'all') return { fromDate: null, toDateExclusive, fromMs: null, toMs: startOfVietnamDate(toDateExclusive) };
  const days = Number(range.slice(0, -1));
  const fromDate = addCalendarDays(today, -(days - 1));
  return { fromDate, toDateExclusive, fromMs: startOfVietnamDate(fromDate), toMs: startOfVietnamDate(toDateExclusive) };
}

interface GroupAccumulator {
  label: string;
  correctUnits: number;
  totalUnits: number;
  attempts: Set<string>;
}

interface QuestionTypeAccumulator {
  correctUnits: number;
  answeredUnits: number;
  blankUnits: number;
  totalUnits: number;
  partialQuestionCount: number;
  totalQuestionCount: number;
}

function addGroup(
  map: Map<string, GroupAccumulator>,
  key: string,
  label: string,
  attemptId: string,
  question: LocalDashboardQuestionEvidence,
): void {
  const current = map.get(key) ?? {
    label,
    correctUnits: 0,
    totalUnits: 0,
    attempts: new Set<string>(),
  };
  current.correctUnits += question.correctUnits;
  current.totalUnits += question.totalUnits;
  current.attempts.add(attemptId);
  map.set(key, current);
}

function isBackendOfficial(attempt: LocalDashboardAttemptV1): boolean {
  return attempt.scoreAuthority === 'BACKEND'
    && attempt.timingAuthority === 'SERVER'
    && attempt.submissionOrigin === 'SERVER_ON_TIME';
}

function isBackendRecovered(attempt: LocalDashboardAttemptV1): boolean {
  return attempt.scoreAuthority === 'BACKEND'
    && attempt.timingAuthority === 'CLIENT_UNVERIFIED'
    && (attempt.submissionOrigin === 'SERVER_ISSUED_LATE' || attempt.submissionOrigin === 'CLIENT_FALLBACK');
}

export function buildLocalDashboardAnalytics(
  scanResult: LocalDashboardScanResult,
  options: BuildLocalDashboardAnalyticsOptions = {},
): LocalDashboardAnalyticsResultV1 {
  const range = options.range ?? '30d';
  const now = options.now ?? new Date();
  const trendLimit = Math.max(1, Math.min(options.trendLimit ?? 50, 50));
  const recentLimit = Math.max(1, Math.min(options.recentLimit ?? 5, 5));
  const scanLimit = options.scanLimit ?? 500;
  const boundary = rangeBoundary(range, now);
  const attempts = scanResult.attempts
    .filter((attempt) => (
      attempt.submittedAt <= now.getTime()
      &&
      attempt.submittedAt < boundary.toMs
      && (boundary.fromMs === null || attempt.submittedAt >= boundary.fromMs)
    ))
    .sort((left, right) => left.submittedAt - right.submittedAt || left.stableId.localeCompare(right.stableId));

  const topicGroups = new Map<string, GroupAccumulator>();
  const cognitiveGroups = new Map<LocalDashboardCognitiveLevel, GroupAccumulator>();
  const questionTypes = new Map<'mcq' | 'true_false', QuestionTypeAccumulator>();
  let reviewedQuestions = 0;
  let blankQuestions = 0;
  let trueFalseQuestions = 0;
  let partialTrueFalseQuestions = 0;
  let questionTypeAttemptCount = 0;
  let topicAttemptCount = 0;
  let cognitiveAttemptCount = 0;

  for (const attempt of attempts) {
    const questions = attempt.normalizedQuestions;
    if (!questions) continue;
    if (questions.length > 0) questionTypeAttemptCount += 1;
    let hasTopic = false;
    let hasCognitive = false;
    for (const question of questions) {
      reviewedQuestions += 1;
      if (question.completionState === 'BLANK') blankQuestions += 1;
      if (question.questionType === 'true_false') {
        trueFalseQuestions += 1;
        if (question.completionState === 'PARTIAL') partialTrueFalseQuestions += 1;
      }
      const type = questionTypes.get(question.questionType) ?? {
        correctUnits: 0,
        answeredUnits: 0,
        blankUnits: 0,
        totalUnits: 0,
        partialQuestionCount: 0,
        totalQuestionCount: 0,
      };
      type.correctUnits += question.correctUnits;
      type.answeredUnits += question.answeredUnits;
      type.blankUnits += question.blankUnits;
      type.totalUnits += question.totalUnits;
      type.totalQuestionCount += 1;
      if (question.completionState === 'PARTIAL') type.partialQuestionCount += 1;
      questionTypes.set(question.questionType, type);

      for (const topic of question.topicRefs) {
        hasTopic = true;
        addGroup(topicGroups, topic.key, topic.label, attempt.stableId, question);
      }
      if (question.cognitiveLevel) {
        hasCognitive = true;
        addGroup(cognitiveGroups, question.cognitiveLevel, question.cognitiveLevel, attempt.stableId, question);
      }
    }
    if (hasTopic) topicAttemptCount += 1;
    if (hasCognitive) cognitiveAttemptCount += 1;
  }

  const scores = attempts.map((attempt) => attempt.totalScore);
  const latest = attempts.at(-1) ?? null;
  const activeDays = new Set(attempts.map((attempt) => vietnamDate(attempt.submittedAt))).size;
  const mcq = questionTypes.get('mcq');
  const tf = questionTypes.get('true_false');
  const topics = [...topicGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => {
    const accuracy = percent(group.correctUnits, group.totalUnits) ?? 0;
    const sample = { accuracy, totalUnits: group.totalUnits, attemptCount: group.attempts.size };
    return {
      key,
      label: group.label,
      accuracy,
      correctUnits: group.correctUnits,
      totalUnits: group.totalUnits,
      attemptCount: group.attempts.size,
      confidence: dashboardConfidence(sample),
      status: classifyDashboardInsight(sample),
    };
  });
  const cognitiveOrder: LocalDashboardCognitiveLevel[] = ['knowledge', 'comprehension', 'application'];
  const cognitiveLevels = cognitiveOrder.filter((level) => cognitiveGroups.has(level)).map((level) => {
    const group = cognitiveGroups.get(level)!;
    const accuracy = percent(group.correctUnits, group.totalUnits);
    const sample = { accuracy, totalUnits: group.totalUnits, attemptCount: group.attempts.size };
    return {
      level,
      accuracy,
      correctUnits: group.correctUnits,
      totalUnits: group.totalUnits,
      attemptCount: group.attempts.size,
      confidence: dashboardConfidence(sample),
      status: classifyDashboardInsight(sample),
    };
  });
  const questionTypeFacts = (['mcq', 'true_false'] as const).filter((type) => questionTypes.has(type)).map((type) => {
    const value = questionTypes.get(type)!;
    return { type, accuracy: percent(value.correctUnits, value.totalUnits), ...value };
  });
  const authorityBreakdown = {
    backendOfficial: attempts.filter(isBackendOfficial).length,
    backendRecovered: attempts.filter(isBackendRecovered).length,
    localFallback: attempts.filter((attempt) => attempt.scoreAuthority === 'LOCAL_FALLBACK').length,
    frontendLegacy: attempts.filter((attempt) => attempt.scoreAuthority === 'FRONTEND_LEGACY').length,
  };
  const detailedAttemptCount = attempts.filter((attempt) => attempt.normalizedQuestions !== null).length;
  const isComplete = !scanResult.diagnostics.matchingKeyLimitReached
    && !scanResult.diagnostics.normalizedAttemptLimitReached
    && scanResult.diagnostics.malformedCount === 0
    && scanResult.diagnostics.unsupportedCount === 0
    && scanResult.diagnostics.ownerConflictCount === 0
    && scanResult.diagnostics.oversizedCount === 0
    && scanResult.diagnostics.storageReadErrorCount === 0;

  return {
    policyVersion: LOCAL_DASHBOARD_POLICY_VERSION,
    generatedAt: now.toISOString(),
    scope: {
      range,
      timezone: TIMEZONE,
      fromDate: boundary.fromDate,
      toDateExclusive: boundary.toDateExclusive,
      ownerFilter: options.ownerFilterKind ?? 'all-for-diagnostics',
    },
    summary: {
      totalAttempts: attempts.length,
      averageScore: scores.length ? round2(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      highestScore: scores.length ? Math.max(...scores) : null,
      latestScore: latest?.totalScore ?? null,
      totalDurationSeconds: attempts.reduce((sum, attempt) => sum + attempt.durationSeconds, 0),
      activeDays,
      mcqAccuracy: mcq ? percent(mcq.correctUnits, mcq.totalUnits) : null,
      tfStatementAccuracy: tf ? percent(tf.correctUnits, tf.totalUnits) : null,
      blankRate: percent(blankQuestions, reviewedQuestions),
      tfPartialRate: percent(partialTrueFalseQuestions, trueFalseQuestions),
    },
    trend: attempts.slice(-trendLimit).map((attempt) => ({
      attemptId: attempt.sessionId ?? attempt.stableId,
      submittedAt: new Date(attempt.submittedAt).toISOString(),
      score: attempt.totalScore,
      mode: attempt.mode,
      title: attempt.title,
    })),
    topics,
    cognitiveLevels,
    questionTypes: questionTypeFacts,
    recentAttempts: [...attempts].reverse().slice(0, recentLimit).map((attempt) => ({
      attemptId: attempt.sessionId ?? attempt.stableId,
      resultRouteId: (
        attempt.sourceKind === 'api-snapshot-v2-cache'
        || attempt.sourceKind === 'v2-result'
      ) ? attempt.sessionId : null,
      submittedAt: new Date(attempt.submittedAt).toISOString(),
      score: attempt.totalScore,
      mode: attempt.mode,
      title: attempt.title,
      durationSeconds: attempt.durationSeconds,
      totalQuestions: attempt.totalQuestions,
      detailStatus: attempt.detailStatus,
    })),
    coverage: {
      summaryAttemptCount: attempts.length,
      detailedAttemptCount,
      questionTypeAttemptCount,
      topicAttemptCount,
      cognitiveAttemptCount,
      totalKnownAttempts: attempts.length,
      scanLimit,
      isComplete,
    },
    authorityBreakdown,
    diagnostics: { ...scanResult.diagnostics },
    pendingRecoveryCount: scanResult.pendingRecoveryCount,
    ownerScopeBreakdown: { ...scanResult.ownerScopeBreakdown },
    excludedOwnerScopeBreakdown: { ...scanResult.excludedOwnerScopeBreakdown },
    sourceBreakdown: { ...scanResult.sourceBreakdown },
  };
}
