export type DashboardState = 'ready' | 'empty' | 'loading' | 'error';
export type DashboardSource = 'local' | 'backend' | 'local-fallback';
export type DashboardRange = '7d' | '30d' | '90d' | 'all';
export type Confidence = 'low' | 'medium' | 'high';
export type InsightStatus = 'strength' | 'developing' | 'weakness' | 'insufficient-data';
export type AttemptMode = 'thi_thu' | 'custom_mock';

export interface DashboardScope {
  source: DashboardSource;
  range: DashboardRange;
  timezone: 'Asia/Ho_Chi_Minh';
  isAuthenticated: boolean;
  fromDate: string | null;
  toDateExclusive: string;
}

export interface DashboardSummary {
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
}

export interface MetricEvidence {
  accuracy: number;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: Confidence;
}

export interface LearningRecommendation {
  id: string;
  title: string;
  reason: string;
  actionLabel: string;
  actionRoute: string;
  priority: 'primary' | 'secondary';
  topicKey: string | null;
  evidence: MetricEvidence | null;
}

export interface ScoreTrendPoint {
  attemptId: string;
  submittedAt: string;
  dateLabel: string;
  score: number;
  mode: AttemptMode;
  title: string;
}

export interface ScoreTrendSeries {
  granularity: 'attempt' | 'day';
  isComplete: boolean;
  sourceAttemptCount: number;
  points: ScoreTrendPoint[];
}

export interface LearningInsight {
  key: string;
  label: string;
  status: InsightStatus;
  accuracy: number;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: Confidence;
  practiceRoute: string | null;
  summary: string;
}

export interface QuestionTypePerformance {
  type: 'mcq' | 'true_false';
  label: string;
  accuracy: number | null;
  correctUnits: number;
  answeredUnits: number;
  blankUnits: number;
  totalUnits: number;
  partialQuestionCount: number;
  totalQuestionCount: number;
  textualSummary: string;
}

export interface CognitivePerformance {
  level: 'knowledge' | 'comprehension' | 'application';
  label: string;
  accuracy: number | null;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: Confidence;
  status: InsightStatus;
  textualSummary: string;
}

export interface RecentAttemptItem {
  attemptId: string;
  title: string;
  mode: AttemptMode;
  modeLabel: string;
  score: number;
  durationSeconds: number;
  submittedAt: string;
  submittedLabel: string;
  totalQuestions: number;
  resultRoute: string | null;
  detailStatus: 'full' | 'summary-only' | 'unavailable';
}

export interface DashboardCoverage {
  summaryAttemptCount: number;
  detailedAttemptCount: number;
  totalKnownAttempts: number;
  fetchLimit: number | null;
  isComplete: boolean;
  capturesTimedOriginal: true;
  capturesCustomMock: true;
  capturesPractice: false;
  capturesRetry: false;
  message: string;
}

/**
 * Tập ID notice hợp lệ. Mọi nơi sinh notice PHẢI dùng một trong các giá trị này.
 * Union type khiến việc đổi tên ID mà quên cập nhật nơi tiêu thụ trở thành lỗi biên dịch.
 * Mảng hằng là nguồn chân lý để test duyệt fixture JSON đối chiếu (fixture nạp qua cast
 * nên tsc không tự bắt được ID lệch trong JSON).
 */
export const DASHBOARD_NOTICE_IDS = [
  // dashboardMappers.ts (nguồn backend)
  'empty-state',
  'partial-detail',
  'unsupported-detail',
  'recovered-attempts',
  'legacy-summary',
  'no-detailed-analytics',
  'excluded-invalid-attempts',
  // localAnalytics/localDashboardMappers.ts (nguồn cục bộ)
  'backend-unavailable-local-fallback',
  'device-only-local-analytics',
  'device-unscoped-excluded',
  'local-coverage-partial',
  'pending-recovery',
  'future-timestamp-dropped',
  // usePersonalLearningDashboard.ts
  'local-storage-unavailable',
  // dashboardFixtures.ts
  'dashboard-not-connected',
  'authentication-required',
  'dashboard-unauthenticated',
  'dashboard-forbidden',
  'dashboard-invalid-request',
  'dashboard-contract',
  'dashboard-transport',
  'dashboard-timeout',
  'dashboard-server',
  'dashboard-unknown',
] as const;

export type DashboardNoticeId = (typeof DASHBOARD_NOTICE_IDS)[number];

export interface DashboardNotice {
  id: DashboardNoticeId;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actionLabel: string | null;
  actionRoute: string | null;
}

export interface PersonalLearningDashboardViewModel {
  state: DashboardState;
  scope: DashboardScope;
  summary: DashboardSummary;
  recommendations: LearningRecommendation[];
  scoreTrend: ScoreTrendSeries;
  strengths: LearningInsight[];
  weaknesses: LearningInsight[];
  questionTypePerformance: QuestionTypePerformance[];
  cognitivePerformance: CognitivePerformance[];
  recentAttempts: RecentAttemptItem[];
  coverage: DashboardCoverage;
  notices: DashboardNotice[];
}
