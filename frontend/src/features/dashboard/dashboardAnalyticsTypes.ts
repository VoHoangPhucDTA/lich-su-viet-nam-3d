export type DashboardAnalyticsRange = '7d' | '30d' | '90d' | 'all';
export type DashboardBackendMode = 'TIMED_ORIGINAL' | 'CUSTOM_MOCK';
export type DashboardScoreAuthority = 'BACKEND' | 'FRONTEND_LEGACY';
export type DashboardTimingAuthority = 'SERVER' | 'CLIENT_UNVERIFIED' | 'LOCAL';
export type DashboardSubmissionOrigin =
  | 'SERVER_ON_TIME'
  | 'SERVER_ISSUED_LATE'
  | 'CLIENT_FALLBACK'
  | 'LOCAL_FALLBACK';
export type DashboardInsightStatus = 'strength' | 'developing' | 'weakness' | 'insufficient-data';
export type DashboardConfidence = 'low' | 'medium' | 'high';
export type DashboardCognitiveLevel = 'knowledge' | 'comprehension' | 'application';
export type DashboardQuestionType = 'mcq' | 'true_false';
export type DashboardDetailStatus = 'full' | 'summary-only' | 'unavailable';

export interface DashboardAttemptAuthorityV1 {
  scoreAuthority: DashboardScoreAuthority;
  timingAuthority: DashboardTimingAuthority;
  submissionOrigin: DashboardSubmissionOrigin;
}

export interface DashboardTrendPointV1 {
  attemptId: string;
  submittedAt: string;
  score: number;
  mode: DashboardBackendMode;
  title: string;
}

export interface DashboardTopicAnalyticsV1 {
  topicKey: string;
  topicLabel: string;
  accuracy: number;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: DashboardConfidence;
  status: DashboardInsightStatus;
}

export interface DashboardCognitiveAnalyticsV1 {
  level: DashboardCognitiveLevel;
  accuracy: number | null;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: DashboardConfidence;
  status: DashboardInsightStatus;
}

export interface DashboardQuestionTypeAnalyticsV1 {
  type: DashboardQuestionType;
  accuracy: number | null;
  correctUnits: number;
  answeredUnits: number;
  blankUnits: number;
  totalUnits: number;
  partialQuestionCount: number;
  totalQuestionCount: number;
}

export interface DashboardRecentAttemptV1 extends DashboardAttemptAuthorityV1 {
  attemptId: string;
  title: string;
  mode: DashboardBackendMode;
  score: number;
  durationSeconds: number;
  submittedAt: string;
  totalQuestions: number;
  detailStatus: DashboardDetailStatus;
}

export interface DashboardAnalyticsResponseV1 {
  schemaVersion: 1;
  generatedAt: string;
  scope: {
    range: DashboardAnalyticsRange;
    timezone: 'Asia/Ho_Chi_Minh';
    fromDate: string | null;
    toDateExclusive: string;
    attemptModes: DashboardBackendMode[];
    policyVersion: 'dashboard-v1';
  };
  summary: {
    totalAttempts: number;
    officialAttemptCount: number;
    recoveredAttemptCount: number;
    legacyAttemptCount: number;
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
  trend: DashboardTrendPointV1[];
  topics: DashboardTopicAnalyticsV1[];
  cognitiveLevels: DashboardCognitiveAnalyticsV1[];
  questionTypes: DashboardQuestionTypeAnalyticsV1[];
  recentAttempts: DashboardRecentAttemptV1[];
  coverage: {
    totalKnownAttempts: number;
    fetchedAttemptCount: number;
    summaryAttemptCount: number;
    detailedAttemptCount: number;
    unsupportedSnapshotCount: number;
    malformedDetailCount: number;
    legacySummaryCount: number;
    fetchLimit: number;
    isComplete: boolean;
  };
  authorityBreakdown: {
    backendOnTime: number;
    backendLate: number;
    backendFallback: number;
    frontendLegacy: number;
  };
  diagnostics: {
    snapshotVersionCounts: Record<string, number>;
    excludedModeCount: number;
    excludedInvalidSummaryCount: number;
  };
}
