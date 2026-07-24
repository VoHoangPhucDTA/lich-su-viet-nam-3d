# Data Contract — Personal Learning Dashboard V1

## 1. Root presentation contract

```ts
type PersonalLearningDashboardViewModel = {
  state: 'ready' | 'empty' | 'loading' | 'error';
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
};
```

Đây là presentation contract ổn định, độc lập DTO backend hiện tại. Nó không chứa React, API implementation, raw question snapshots, answer key hay secret.

## 2. Subtypes

```ts
type DashboardSource = 'local' | 'backend' | 'local-fallback';
type DashboardRange = '7d' | '30d' | '90d' | 'all';
type Confidence = 'low' | 'medium' | 'high';
type InsightStatus = 'strength' | 'developing' | 'weakness' | 'insufficient-data';
type AttemptMode = 'thi_thu' | 'custom_mock';

type DashboardScope = {
  source: DashboardSource;
  range: DashboardRange;
  timezone: 'Asia/Ho_Chi_Minh';
  isAuthenticated: boolean;
  fromDate: string | null;
  toDateExclusive: string;
};

type DashboardSummary = {
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

type LearningRecommendation = {
  id: string;
  title: string;
  reason: string;
  actionLabel: string;
  actionRoute: string;
  priority: 'primary' | 'secondary';
  topicKey: string | null;
  evidence: MetricEvidence | null;
};

type MetricEvidence = {
  accuracy: number;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: Confidence;
};

type ScoreTrendPoint = {
  attemptId: string;
  submittedAt: string;
  dateLabel: string;
  score: number;
  mode: AttemptMode;
  title: string;
};

type ScoreTrendSeries = {
  granularity: 'attempt' | 'day';
  isComplete: boolean;
  sourceAttemptCount: number;
  points: ScoreTrendPoint[];
};

type LearningInsight = {
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
};

type QuestionTypePerformance = {
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
};

type CognitivePerformance = {
  level: 'knowledge' | 'comprehension' | 'application';
  label: string;
  accuracy: number | null;
  correctUnits: number;
  totalUnits: number;
  attemptCount: number;
  confidence: Confidence;
  status: InsightStatus;
  textualSummary: string;
};

type RecentAttemptItem = {
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
};

type DashboardCoverage = {
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
};

type DashboardNotice = {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actionLabel: string | null;
  actionRoute: string | null;
};
```

Tổng cộng có 17 subtype/union được đặt tên ngoài root view model.

## 3. Conventions

- Score: `0–10`; percentage: `0–100`; duration: seconds; counts: integer không âm.
- `scope.fromDate` và `scope.toDateExclusive` là ngày lịch `YYYY-MM-DD` được diễn giải trong `Asia/Ho_Chi_Minh`; cận trên là exclusive. Range `all` dùng `fromDate = null`. Ví dụ range 30 ngày: `2026-06-16` đến trước `2026-07-16`.
- Timestamp của bài thi (`submittedAt`) vẫn dùng ISO 8601 UTC (`2026-07-15T08:30:00Z`). `dateLabel`/`submittedLabel` chỉ là field presentation, không dùng làm timestamp.
- `scoreTrend.sourceAttemptCount` là số bài thi làm nguồn cho chuỗi. `points` có thể ít hơn khi tổng hợp/lấy mẫu; `isComplete` chỉ true khi chuỗi bao phủ đủ nguồn. `granularity = 'attempt'` nghĩa là mỗi point là một bài thi. Không diễn giải chuỗi không đầy đủ như toàn bộ lịch sử.
- Mọi chart có `textualSummary` hoặc dữ liệu danh sách tương đương; tooltip không phải nguồn duy nhất.
- `null` nghĩa là không đủ/không có dữ liệu; không thay bằng 0 nếu 0 tạo hiểu sai.
- Insight luôn có sample size và attempt count. Policy `dashboard-v1` đã khóa: insufficient nếu
  `<8 units` hoặc `<2 attempts`; medium khi `≥16 units` và `≥3 attempts`; high khi `≥30 units` và
  `≥5 attempts`; còn lại low. Insufficient-data ưu tiên hơn accuracy band.
- `attemptId` trong mock là ID hư cấu; production có thể map từ `sessionId` nhưng contract không buộc backend DTO.

## 4. Learning units

### MCQ

```text
totalUnits = 1
correctUnits = 1 nếu đúng
answeredUnits = 1 nếu đã chọn
blankUnits = 1 nếu bỏ trống
```

### T/F

```text
totalUnits = số statement
correctUnits = số statement đúng
answeredUnits = số statement đã trả lời
blankUnits = số statement chưa trả lời
partial = answeredUnits > 0 && answeredUnits < totalUnits
```

T/F chart không dùng whole-question correctness làm denominator duy nhất. `tfPartialRate` đo câu T/F partial, còn `tfStatementAccuracy` đo statement.

## 5. Aggregation and trust

Không có `merged` source trong V1: authenticated backend success là backend-only; local chỉ là anonymous
explicit-local hoặc exact-owner fallback khi backend unavailable. Không union backend và local theo
`attemptId/sessionId`. Backend response hiện dùng bounded fetch và coverage phải nói rõ phần đã phân tích.
Score là learning-only vì backend chưa re-score.
