import type { DashboardAnalyticsRange } from '../dashboardAnalyticsTypes';

export const LOCAL_DASHBOARD_POLICY_VERSION = 'dashboard-v1' as const;

export type LocalDashboardSourceKind =
  | 'api-snapshot-v2-cache'
  | 'v2-result'
  | 'recovery-local-result';

export type LocalDashboardOwnerScope =
  | 'anonymous'
  | 'authenticated-owner'
  | 'device-legacy-unscoped'
  | 'unknown'
  | 'conflicting';

export type LocalDashboardMode = 'TIMED_ORIGINAL' | 'CUSTOM_MOCK';
export type LocalDashboardScoreAuthority = 'BACKEND' | 'LOCAL_FALLBACK' | 'FRONTEND_LEGACY';
export type LocalDashboardTimingAuthority = 'SERVER' | 'CLIENT_UNVERIFIED' | 'LOCAL';
export type LocalDashboardSubmissionOrigin =
  | 'SERVER_ON_TIME'
  | 'SERVER_ISSUED_LATE'
  | 'CLIENT_FALLBACK'
  | 'LOCAL_FALLBACK';
export type LocalDashboardDetailStatus = 'full' | 'question-type-only' | 'summary-only';
export type LocalDashboardCompletionState = 'BLANK' | 'PARTIAL' | 'COMPLETE';
export type LocalDashboardCognitiveLevel = 'knowledge' | 'comprehension' | 'application';

export interface LocalDashboardTopicRef {
  key: string;
  label: string;
  periodKey: string | null;
  periodLabel: string | null;
}

/** Safe aggregation evidence only. Raw selections and answer keys never leave an adapter. */
export interface LocalDashboardQuestionEvidence {
  questionId: string;
  questionType: 'mcq' | 'true_false';
  completionState: LocalDashboardCompletionState;
  correctUnits: number;
  answeredUnits: number;
  blankUnits: number;
  totalUnits: number;
  topicRefs: LocalDashboardTopicRef[];
  cognitiveLevel: LocalDashboardCognitiveLevel | null;
}

export interface LocalDashboardAttemptV1 {
  stableId: string;
  sourceKind: LocalDashboardSourceKind;
  sourcePriority: number;
  sessionId: string | null;
  localSessionId: string | null;
  serverSessionId: string | null;
  clientSubmissionId: string | null;
  ownerScope: LocalDashboardOwnerScope;
  ownerKey: string | null;
  mode: LocalDashboardMode;
  title: string;
  totalScore: number;
  durationSeconds: number;
  submittedAt: number;
  totalQuestions: number;
  scoreAuthority: LocalDashboardScoreAuthority;
  timingAuthority: LocalDashboardTimingAuthority;
  submissionOrigin: LocalDashboardSubmissionOrigin;
  datasetVersion: string | null;
  examContentHash: string | null;
  detailStatus: LocalDashboardDetailStatus;
  normalizedQuestions: LocalDashboardQuestionEvidence[] | null;
  pendingRecovery: boolean;
  malformedReason: null;
}

export type LocalDashboardAdapterFailureReason =
  | 'invalid-json'
  | 'unknown-schema'
  | 'unsupported-mode'
  | 'missing-identity'
  | 'missing-score'
  | 'invalid-score'
  | 'missing-timestamp'
  | 'invalid-duration'
  | 'invalid-total-questions'
  | 'snapshot-version-mismatch'
  | 'invalid-question-detail';

export type LocalDashboardAdapterResult =
  | { status: 'success'; attempt: LocalDashboardAttemptV1 }
  | { status: 'unsupported'; reason: LocalDashboardAdapterFailureReason }
  | { status: 'malformed'; reason: LocalDashboardAdapterFailureReason };

export interface LocalDashboardRecoveryMetadata {
  ownerKey: string;
  clientSubmissionId: string;
  serverSessionId: string | null;
  localSessionId: string | null;
  pending: boolean;
  localResult: unknown | null;
}

export interface LocalDashboardScanDiagnostics {
  /** Số key localStorage thực sự đã đọc sau allow-list và giới hạn. */
  scannedKeyCount: number;
  /** Số record đã được đưa qua adapter; array key có thể đóng góp nhiều record. */
  scannedRecordCount: number;
  matchingKeyCount: number;
  supportedRecordCount: number;
  deduplicatedRecordCount: number;
  duplicateGroupCount: number;
  ownerConflictCount: number;
  malformedCount: number;
  unsupportedCount: number;
  oversizedCount: number;
  storageReadErrorCount: number;
  matchingKeyLimitReached: boolean;
  normalizedAttemptLimitReached: boolean;
  /** Số bài bị loại vì timestamp vượt quá dung sai lệch đồng hồ. */
  futureTimestampDroppedCount: number;
}

export type LocalDashboardOwnerFilter =
  | { kind: 'anonymous' }
  | { kind: 'authenticated-owner'; ownerKey: string }
  | { kind: 'all-for-diagnostics' };

export interface LocalDashboardScanOptions {
  ownerFilter: LocalDashboardOwnerFilter;
  maxMatchingKeys?: number;
  maxNormalizedAttempts?: number;
  maxPayloadCharacters?: number;
}

export interface LocalDashboardScanResult {
  attempts: LocalDashboardAttemptV1[];
  diagnostics: LocalDashboardScanDiagnostics;
  pendingRecoveryCount: number;
  ownerScopeBreakdown: Record<LocalDashboardOwnerScope, number>;
  excludedOwnerScopeBreakdown: Record<LocalDashboardOwnerScope, number>;
  sourceBreakdown: Partial<Record<LocalDashboardSourceKind, number>>;
}

export interface LocalDashboardInsightFact {
  key: string;
  label: string;
  accuracy: number;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: 'low' | 'medium' | 'high';
  status: 'strength' | 'developing' | 'weakness' | 'insufficient-data';
}

export interface LocalDashboardCognitiveFact {
  level: LocalDashboardCognitiveLevel;
  accuracy: number | null;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: 'low' | 'medium' | 'high';
  status: 'strength' | 'developing' | 'weakness' | 'insufficient-data';
}

export interface LocalDashboardQuestionTypeFact {
  type: 'mcq' | 'true_false';
  accuracy: number | null;
  correctUnits: number;
  answeredUnits: number;
  blankUnits: number;
  totalUnits: number;
  partialQuestionCount: number;
  totalQuestionCount: number;
}

export interface LocalDashboardAnalyticsResultV1 {
  policyVersion: typeof LOCAL_DASHBOARD_POLICY_VERSION;
  generatedAt: string;
  scope: {
    range: DashboardAnalyticsRange;
    timezone: 'Asia/Ho_Chi_Minh';
    fromDate: string | null;
    toDateExclusive: string;
    ownerFilter: LocalDashboardOwnerFilter['kind'];
  };
  summary: {
    totalAttempts: number;
    averageScore: number | null;
    highestScore: number | null;
    latestScore: number | null;
    totalDurationSeconds: number;
    activeDays: number;
    mcqAccuracy: number | null;
    tfStatementAccuracy: number | null;
    blankRate: number | null;
    tfPartialRate: number | null;
  };
  trend: Array<{
    attemptId: string;
    submittedAt: string;
    score: number;
    mode: LocalDashboardMode;
    title: string;
  }>;
  topics: LocalDashboardInsightFact[];
  cognitiveLevels: LocalDashboardCognitiveFact[];
  questionTypes: LocalDashboardQuestionTypeFact[];
  recentAttempts: Array<{
    attemptId: string;
    resultRouteId: string | null;
    submittedAt: string;
    score: number;
    mode: LocalDashboardMode;
    title: string;
    durationSeconds: number;
    totalQuestions: number;
    detailStatus: LocalDashboardDetailStatus;
  }>;
  coverage: {
    summaryAttemptCount: number;
    detailedAttemptCount: number;
    questionTypeAttemptCount: number;
    topicAttemptCount: number;
    cognitiveAttemptCount: number;
    totalKnownAttempts: number;
    scanLimit: number;
    isComplete: boolean;
  };
  authorityBreakdown: {
    backendOfficial: number;
    backendRecovered: number;
    localFallback: number;
    frontendLegacy: number;
  };
  diagnostics: LocalDashboardScanDiagnostics;
  pendingRecoveryCount: number;
  ownerScopeBreakdown: Record<LocalDashboardOwnerScope, number>;
  excludedOwnerScopeBreakdown: Record<LocalDashboardOwnerScope, number>;
  sourceBreakdown: Partial<Record<LocalDashboardSourceKind, number>>;
}

export interface BuildLocalDashboardAnalyticsOptions {
  range?: DashboardAnalyticsRange;
  now?: Date;
  trendLimit?: number;
  recentLimit?: number;
  scanLimit?: number;
  ownerFilterKind?: LocalDashboardOwnerFilter['kind'];
}
