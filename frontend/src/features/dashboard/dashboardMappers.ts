import { formatCognitiveLevelLabel, formatQuestionTypeLabel } from '@/lib/exam/displayLabels';
import {
  classifyDashboardInsight,
  dashboardConfidence,
  dashboardModeLabel,
  mapDashboardBackendMode,
} from './dashboardAnalyticsPolicy';
import type {
  DashboardAnalyticsResponseV1,
  DashboardCognitiveAnalyticsV1,
  DashboardTopicAnalyticsV1,
} from './dashboardAnalyticsTypes';
import {
  formatDashboardDateLabel,
  formatDashboardSubmittedLabel,
} from './dashboardFormatters';
import {
  dashboardTopicRoute,
  selectRecommendationCandidate,
} from './dashboardRecommendation';
import type {
  CognitivePerformance,
  DashboardNotice,
  LearningInsight,
  LearningRecommendation,
  MetricEvidence,
  PersonalLearningDashboardViewModel,
  QuestionTypePerformance,
  RecentAttemptItem,
} from './dashboardTypes';

type NormalizedTopic = DashboardTopicAnalyticsV1;
type NormalizedCognitive = DashboardCognitiveAnalyticsV1;

function normalizeTopic(item: DashboardTopicAnalyticsV1): NormalizedTopic {
  const sample = {
    accuracy: item.accuracy,
    totalUnits: item.totalUnits,
    attemptCount: item.attemptCount,
  };
  return {
    ...item,
    status: classifyDashboardInsight(sample),
    confidence: dashboardConfidence(sample),
  };
}

function normalizeCognitive(item: DashboardCognitiveAnalyticsV1): NormalizedCognitive {
  const sample = {
    accuracy: item.accuracy,
    totalUnits: item.totalUnits,
    attemptCount: item.attemptCount,
  };
  return {
    ...item,
    status: classifyDashboardInsight(sample),
    confidence: dashboardConfidence(sample),
  };
}

function topicEvidence(topic: NormalizedTopic): MetricEvidence {
  return {
    accuracy: topic.accuracy,
    correctUnits: topic.correctUnits,
    totalUnits: topic.totalUnits,
    attemptCount: topic.attemptCount,
    confidence: topic.confidence,
  };
}

function createRecommendation(
  response: DashboardAnalyticsResponseV1,
  topics: NormalizedTopic[],
): LearningRecommendation {
  if (response.summary.totalAttempts === 0) {
    return {
      id: 'start-first-exam',
      title: 'Bắt đầu với một đề thi',
      reason: 'Hoàn thành một đề thi thử để mở khóa xu hướng điểm và phân tích học tập.',
      actionLabel: 'Làm đề ngay',
      actionRoute: '/exams/browse',
      priority: 'primary',
      topicKey: null,
      evidence: null,
    };
  }

  const selection = selectRecommendationCandidate(topics.map(topic => ({
    key: topic.topicKey,
    label: topic.topicLabel,
    accuracy: topic.accuracy,
    correctUnits: topic.correctUnits,
    totalUnits: topic.totalUnits,
    attemptCount: topic.attemptCount,
    confidence: topic.confidence,
    status: topic.status,
  })));
  if (selection?.tier === 'weakness') {
    const weakness = topics.find(topic => topic.topicKey === selection.candidate.key)!;
    return {
      id: `weakness-${weakness.topicKey}`,
      title: `Ôn lại ${weakness.topicLabel}`,
      reason: `Độ chính xác ${weakness.accuracy.toLocaleString('vi-VN')}% trên ${weakness.totalUnits} ý qua ${weakness.attemptCount} bài; đây là chủ đề yếu có đủ mẫu.`,
      actionLabel: 'Ôn chủ đề này',
      actionRoute: dashboardTopicRoute(weakness.topicKey),
      priority: 'primary',
      topicKey: weakness.topicKey,
      evidence: topicEvidence(weakness),
    };
  }

  if (selection?.tier === 'developing') {
    const developing = topics.find(topic => topic.topicKey === selection.candidate.key)!;
    return {
      id: `developing-${developing.topicKey}`,
      title: `Tiếp tục củng cố ${developing.topicLabel}`,
      reason: `Độ chính xác hiện tại là ${developing.accuracy.toLocaleString('vi-VN')}%; thêm một lượt ôn có trọng tâm sẽ giúp cải thiện nhóm kiến thức này.`,
      actionLabel: 'Tiếp tục ôn chủ đề',
      actionRoute: dashboardTopicRoute(developing.topicKey),
      priority: 'primary',
      topicKey: developing.topicKey,
      evidence: topicEvidence(developing),
    };
  }

  if (selection?.tier === 'insufficient-data') {
    const insufficient = topics.find(topic => topic.topicKey === selection.candidate.key)!;
    return {
      id: `insufficient-${insufficient.topicKey}`,
      title: `Làm thêm đề để hiểu rõ ${insufficient.topicLabel}`,
      reason: `Chủ đề này mới có ${insufficient.totalUnits} ý qua ${insufficient.attemptCount} bài, chưa đủ mẫu để kết luận là điểm mạnh hay điểm yếu.`,
      actionLabel: 'Làm thêm một đề',
      actionRoute: '/exams/browse',
      priority: 'primary',
      topicKey: insufficient.topicKey,
      evidence: topicEvidence(insufficient),
    };
  }

  const lowestConfidence = selection
    ? topics.find(topic => topic.topicKey === selection.candidate.key) ?? null
    : null;
  return {
    id: 'continue-custom-mock',
    title: lowestConfidence
      ? `Duy trì phong độ với một đề tùy chọn`
      : 'Làm thêm đề để mở rộng phân tích',
    reason: lowestConfidence
      ? `Các nhóm đã phân tích đều đạt kết quả tốt. Hãy tiếp tục luyện đề để duy trì độ ổn định, ưu tiên ${lowestConfidence.topicLabel}.`
      : 'Các bài đã có điểm tổng quan nhưng chưa có đủ chi tiết chủ đề để tạo gợi ý chuyên sâu.',
    actionLabel: lowestConfidence ? 'Tạo đề tùy chọn' : 'Duyệt kho đề',
    actionRoute: lowestConfidence ? '/exams/tao-de' : '/exams/browse',
    priority: 'primary',
    topicKey: null,
    evidence: lowestConfidence ? topicEvidence(lowestConfidence) : null,
  };
}

function mapLearningInsight(topic: NormalizedTopic): LearningInsight {
  const statusSummary = topic.status === 'strength'
    ? 'Kết quả ổn định và đã đạt ngưỡng điểm mạnh.'
    : topic.status === 'weakness'
      ? 'Nên ưu tiên ôn lại trong lượt học tiếp theo.'
      : topic.status === 'developing'
        ? 'Đang tiến bộ nhưng vẫn còn dư địa cải thiện.'
        : 'Mẫu dữ liệu còn ít, chưa đủ để gắn nhãn.';
  return {
    key: topic.topicKey,
    label: topic.topicLabel,
    status: topic.status,
    accuracy: topic.accuracy,
    correctUnits: topic.correctUnits,
    totalUnits: topic.totalUnits,
    attemptCount: topic.attemptCount,
    confidence: topic.confidence,
    practiceRoute: topic.status === 'weakness' ? dashboardTopicRoute(topic.topicKey) : null,
    summary: statusSummary,
  };
}

function mapCognitive(item: NormalizedCognitive): CognitivePerformance {
  const accuracyText = item.accuracy === null
    ? 'Chưa có độ chính xác đáng tin cậy'
    : `Độ chính xác ${item.accuracy.toLocaleString('vi-VN')}%`;
  return {
    level: item.level,
    label: formatCognitiveLevelLabel(item.level),
    accuracy: item.accuracy,
    correctUnits: item.correctUnits,
    totalUnits: item.totalUnits,
    attemptCount: item.attemptCount,
    confidence: item.confidence,
    status: item.status,
    textualSummary: `${accuracyText} trên ${item.totalUnits} ý qua ${item.attemptCount} bài.`,
  };
}

function mapQuestionType(
  item: DashboardAnalyticsResponseV1['questionTypes'][number],
): QuestionTypePerformance {
  const baseLabel = formatQuestionTypeLabel(item.type);
  const label = item.type === 'true_false' ? `${baseLabel} theo mệnh đề` : baseLabel;
  return {
    type: item.type,
    label,
    accuracy: item.accuracy,
    correctUnits: item.correctUnits,
    answeredUnits: item.answeredUnits,
    blankUnits: item.blankUnits,
    totalUnits: item.totalUnits,
    partialQuestionCount: item.partialQuestionCount,
    totalQuestionCount: item.totalQuestionCount,
    textualSummary: item.type === 'mcq'
      ? `${item.correctUnits}/${item.totalUnits} câu đúng · ${item.blankUnits} câu bỏ trống`
      : `${item.correctUnits}/${item.totalUnits} mệnh đề đúng · ${item.blankUnits} bỏ trống · ${item.partialQuestionCount}/${item.totalQuestionCount} câu làm dở`,
  };
}

function mapRecentAttempt(
  item: DashboardAnalyticsResponseV1['recentAttempts'][number],
): RecentAttemptItem {
  return {
    attemptId: item.attemptId,
    title: item.title,
    mode: mapDashboardBackendMode(item.mode),
    modeLabel: dashboardModeLabel(item.mode),
    score: item.score,
    durationSeconds: item.durationSeconds,
    submittedAt: item.submittedAt,
    submittedLabel: formatDashboardSubmittedLabel(item.submittedAt),
    totalQuestions: item.totalQuestions,
    resultRoute: `/exams/ket-qua/${encodeURIComponent(item.attemptId)}`,
    detailStatus: item.detailStatus,
  };
}

function createCoverageMessage(response: DashboardAnalyticsResponseV1): string {
  const { coverage } = response;
  if (!coverage.isComplete) {
    return `Đã tải ${coverage.fetchedAttemptCount}/${coverage.totalKnownAttempts} bài; phân tích chi tiết ${coverage.detailedAttemptCount}/${coverage.summaryAttemptCount} bài có tổng quan.`;
  }
  if (coverage.detailedAttemptCount < coverage.summaryAttemptCount) {
    return `Có ${coverage.detailedAttemptCount}/${coverage.summaryAttemptCount} bài đủ dữ liệu chi tiết; phần còn lại chỉ đóng góp tổng quan.`;
  }
  return `Đã bao phủ đầy đủ ${coverage.summaryAttemptCount} bài và dữ liệu chi tiết tương ứng.`;
}

function createNotices(response: DashboardAnalyticsResponseV1): DashboardNotice[] {
  if (response.summary.totalAttempts === 0) {
    return [{
      id: 'empty-state',
      type: 'info',
      title: 'Chưa có bài thi nào',
      message: 'Hoàn thành một đề thi thử để bắt đầu theo dõi kết quả học tập.',
      actionLabel: 'Làm đề ngay',
      actionRoute: '/exams/browse',
    }];
  }

  const notices: DashboardNotice[] = [];
  const { coverage, summary, authorityBreakdown } = response;
  if (!coverage.isComplete || coverage.detailedAttemptCount < coverage.summaryAttemptCount) {
    notices.push({
      id: 'partial-detail',
      type: 'warning',
      title: 'Phân tích chưa bao phủ toàn bộ lịch sử',
      message: createCoverageMessage(response),
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (coverage.unsupportedSnapshotCount > 0 || coverage.malformedDetailCount > 0) {
    notices.push({
      id: 'unsupported-detail',
      type: 'warning',
      title: 'Một số bài không có chi tiết dùng được',
      message: `${coverage.unsupportedSnapshotCount} snapshot chưa được hỗ trợ và ${coverage.malformedDetailCount} chi tiết không hợp lệ đã bị loại khỏi phân tích sâu.`,
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (summary.recoveredAttemptCount > 0) {
    notices.push({
      id: 'recovered-attempts',
      type: 'info',
      title: 'Có kết quả được khôi phục',
      message: `${authorityBreakdown.backendLate} bài nộp muộn và ${authorityBreakdown.backendFallback} bài fallback đã được máy chủ chấm; thời gian làm bài chưa được xác minh như bài đúng hạn.`,
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (summary.legacyAttemptCount > 0) {
    notices.push({
      id: 'legacy-summary',
      type: 'info',
      title: 'Có dữ liệu tổng quan legacy',
      message: `${summary.legacyAttemptCount} bài legacy chỉ đóng góp KPI và xu hướng, không được dùng cho phân tích chủ đề hoặc mức nhận thức.`,
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (coverage.detailedAttemptCount === 0) {
    notices.push({
      id: 'no-detailed-analytics',
      type: 'info',
      title: 'Chưa có dữ liệu phân tích chi tiết',
      message: 'Điểm tổng quan vẫn được hiển thị, nhưng chưa có immutable detail phù hợp để phân tích chủ đề và mức nhận thức.',
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (response.diagnostics.excludedInvalidSummaryCount > 0) {
    notices.push({
      id: 'excluded-invalid-attempts',
      type: 'warning',
      title: 'Một số bài chưa được tính vào thống kê',
      message: `${response.diagnostics.excludedInvalidSummaryCount} bài có dữ liệu chấm điểm không hợp lệ nên đã bị loại khỏi toàn bộ thống kê. Nếu số này tăng dần, hãy báo cho quản trị viên.`,
      actionLabel: null,
      actionRoute: null,
    });
  }
  return notices;
}

export function mapDashboardAnalyticsToViewModel(
  response: DashboardAnalyticsResponseV1,
): PersonalLearningDashboardViewModel {
  const topics = response.topics.map(normalizeTopic);
  const cognitive = response.cognitiveLevels.map(normalizeCognitive);
  const strengths = topics
    .filter((topic) => topic.status === 'strength')
    .map(mapLearningInsight);
  const weaknesses = topics
    .filter((topic) => topic.status === 'weakness')
    .map(mapLearningInsight);
  const chronologicalTrend = response.trend
    .map((point) => ({ ...point }))
    .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));
  const recentAttempts = response.recentAttempts
    .map((attempt) => ({ ...attempt }))
    .sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt))
    .map(mapRecentAttempt);

  return {
    state: response.summary.totalAttempts === 0 ? 'empty' : 'ready',
    scope: {
      source: 'backend',
      range: response.scope.range,
      timezone: response.scope.timezone,
      isAuthenticated: true,
      fromDate: response.scope.fromDate,
      toDateExclusive: response.scope.toDateExclusive,
    },
    summary: {
      totalAttempts: response.summary.totalAttempts,
      averageScore: response.summary.averageScore,
      highestScore: response.summary.highestScore,
      latestScore: response.summary.latestScore,
      totalDurationSeconds: response.summary.totalDurationSeconds,
      activeDays: response.summary.activeDays,
      mcqAccuracy: response.summary.mcqAccuracy,
      tfStatementAccuracy: response.summary.tfStatementAccuracy,
      blankRate: response.summary.blankRate,
      tfPartialRate: response.summary.tfPartialRate,
    },
    recommendations: [createRecommendation(response, topics)],
    scoreTrend: {
      granularity: 'attempt',
      isComplete: response.coverage.isComplete
        && chronologicalTrend.length === response.coverage.summaryAttemptCount,
      sourceAttemptCount: response.coverage.summaryAttemptCount,
      points: chronologicalTrend.map((point) => ({
        attemptId: point.attemptId,
        submittedAt: point.submittedAt,
        dateLabel: formatDashboardDateLabel(point.submittedAt),
        score: point.score,
        mode: mapDashboardBackendMode(point.mode),
        title: point.title,
      })),
    },
    strengths,
    weaknesses,
    questionTypePerformance: response.questionTypes.map(mapQuestionType),
    cognitivePerformance: cognitive.map(mapCognitive),
    recentAttempts,
    coverage: {
      summaryAttemptCount: response.coverage.summaryAttemptCount,
      detailedAttemptCount: response.coverage.detailedAttemptCount,
      totalKnownAttempts: response.coverage.totalKnownAttempts,
      fetchLimit: response.coverage.fetchLimit,
      isComplete: response.coverage.isComplete,
      capturesTimedOriginal: true,
      capturesCustomMock: true,
      capturesPractice: false,
      capturesRetry: false,
      message: createCoverageMessage(response),
    },
    notices: createNotices(response),
  };
}
