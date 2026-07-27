import { formatCognitiveLevelLabel, formatQuestionTypeLabel } from '@/lib/exam/displayLabels';
import {
  formatDashboardDateLabel,
  formatDashboardSubmittedLabel,
} from '../dashboardFormatters';
import {
  dashboardTopicRoute,
  selectRecommendationCandidate,
} from '../dashboardRecommendation';
import { createDeviceUnscopedExcludedNotice } from '../dashboardNoticeFactories';
import type {
  LearningRecommendation,
  PersonalLearningDashboardViewModel,
} from '../dashboardTypes';
import type { LocalDashboardAnalyticsResultV1 } from './localDashboardTypes';

export interface LocalDashboardViewModelOptions {
  source?: 'local' | 'local-fallback';
}

function createLocalRecommendation(facts: LocalDashboardAnalyticsResultV1): LearningRecommendation {
  if (facts.summary.totalAttempts === 0) {
    return {
      id: 'start-local-exam',
      title: 'Làm một đề thi để bắt đầu',
      reason: 'Thiết bị này chưa có kết quả phù hợp với dashboard policy V1.',
      actionLabel: 'Duyệt kho đề',
      actionRoute: '/exams/browse',
      priority: 'primary',
      topicKey: null,
      evidence: null,
    };
  }
  const selection = selectRecommendationCandidate(facts.topics);
  if (!selection) {
    return {
      id: 'continue-local-exams',
      title: 'Làm thêm đề để mở rộng phân tích',
      reason: 'Các kết quả cục bộ hiện chưa có đủ chi tiết chủ đề.',
      actionLabel: 'Duyệt kho đề',
      actionRoute: '/exams/browse',
      priority: 'primary',
      topicKey: null,
      evidence: null,
    };
  }
  const topic = selection.candidate;
  const evidence = {
    accuracy: topic.accuracy,
    correctUnits: topic.correctUnits,
    totalUnits: topic.totalUnits,
    attemptCount: topic.attemptCount,
    confidence: topic.confidence,
  };
  if (selection.tier === 'weakness') {
    return {
      id: `local-weakness-${topic.key}`,
      title: `Ôn lại ${topic.label}`,
      reason: `Dữ liệu cục bộ ghi nhận độ chính xác ${topic.accuracy.toLocaleString('vi-VN')}% qua ${topic.attemptCount} bài.`,
      actionLabel: 'Ôn chủ đề này',
      actionRoute: dashboardTopicRoute(topic.key),
      priority: 'primary',
      topicKey: topic.key,
      evidence,
    };
  }
  if (selection.tier === 'developing') {
    return {
      id: `local-developing-${topic.key}`,
      title: `Tiếp tục củng cố ${topic.label}`,
      reason: `Độ chính xác cục bộ hiện tại là ${topic.accuracy.toLocaleString('vi-VN')}%.`,
      actionLabel: 'Tiếp tục ôn chủ đề',
      actionRoute: dashboardTopicRoute(topic.key),
      priority: 'primary',
      topicKey: topic.key,
      evidence,
    };
  }
  if (selection.tier === 'insufficient-data') {
    return {
      id: `local-insufficient-${topic.key}`,
      title: `Làm thêm đề để hiểu rõ ${topic.label}`,
      reason: `Chủ đề này mới có ${topic.totalUnits} ý qua ${topic.attemptCount} bài, chưa đủ mẫu để kết luận.`,
      actionLabel: 'Làm thêm một đề',
      actionRoute: '/exams/browse',
      priority: 'primary',
      topicKey: topic.key,
      evidence,
    };
  }
  return {
    id: 'continue-local-custom-mock',
    title: 'Duy trì phong độ với một đề tùy chọn',
    reason: `Các nhóm đã phân tích đều đạt kết quả tốt. Hãy tiếp tục luyện đề, ưu tiên ${topic.label}.`,
    actionLabel: 'Tạo đề tùy chọn',
    actionRoute: '/exams/tao-de',
    priority: 'primary',
    topicKey: null,
    evidence,
  };
}

function buildLocalNotices(
  facts: LocalDashboardAnalyticsResultV1,
  source: 'local' | 'local-fallback',
): PersonalLearningDashboardViewModel['notices'] {
  const notices: PersonalLearningDashboardViewModel['notices'] = [];
  if (source === 'local-fallback') {
    notices.push({
      id: 'backend-unavailable-local-fallback',
      type: 'warning',
      title: 'Máy chủ thống kê đang tạm thời không khả dụng',
      message: 'Dashboard đang hiển thị riêng dữ liệu cục bộ thuộc đúng tài khoản hiện tại trên thiết bị này. Đây không phải toàn bộ lịch sử tài khoản.',
      actionLabel: null,
      actionRoute: null,
    });
  }
  notices.push({
    id: 'device-only-local-analytics',
    type: 'info',
    title: source === 'local-fallback' ? 'Đang xem dữ liệu dự phòng trên thiết bị' : 'Dữ liệu chỉ có trên thiết bị này',
    message: 'Các thống kê này không đại diện cho toàn bộ lịch sử tài khoản và không được tự động gộp với backend.',
    actionLabel: source === 'local' ? 'Đăng nhập' : null,
    actionRoute: source === 'local' ? '/login' : null,
  });
  if (facts.excludedOwnerScopeBreakdown['device-legacy-unscoped'] > 0) {
    notices.push(createDeviceUnscopedExcludedNotice());
  }
  if (!facts.coverage.isComplete || facts.coverage.detailedAttemptCount < facts.coverage.summaryAttemptCount) {
    notices.push({
      id: 'local-coverage-partial',
      type: 'warning',
      title: 'Phân tích cục bộ chưa đầy đủ',
      message: `${facts.coverage.detailedAttemptCount}/${facts.coverage.summaryAttemptCount} bài có chi tiết bất biến dùng được.`,
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (facts.pendingRecoveryCount > 0) {
    notices.push({
      id: 'pending-recovery',
      type: 'info',
      title: 'Có bài đang chờ đồng bộ',
      message: `${facts.pendingRecoveryCount} bài đang chờ quy trình khôi phục hiện có; queue item không được tính thành bài thứ hai.`,
      actionLabel: null,
      actionRoute: null,
    });
  }
  if (facts.diagnostics.futureTimestampDroppedCount > 0) {
    notices.push({
      id: 'future-timestamp-dropped',
      type: 'warning',
      title: 'Một số bài có mốc thời gian bất thường',
      message: `${facts.diagnostics.futureTimestampDroppedCount} bài có thời điểm nộp nằm quá xa trong tương lai nên chưa được tính. Hãy kiểm tra ngày giờ của thiết bị.`,
      actionLabel: null,
      actionRoute: null,
    });
  }
  return notices;
}

export function mapLocalDashboardAnalyticsToViewModel(
  facts: LocalDashboardAnalyticsResultV1,
  options: LocalDashboardViewModelOptions = {},
): PersonalLearningDashboardViewModel {
  const source = options.source ?? 'local';
  const strengths = facts.topics.filter((topic) => topic.status === 'strength').map((topic) => ({
    key: topic.key,
    label: topic.label,
    status: topic.status,
    accuracy: topic.accuracy,
    correctUnits: topic.correctUnits,
    totalUnits: topic.totalUnits,
    attemptCount: topic.attemptCount,
    confidence: topic.confidence,
    practiceRoute: null,
    summary: 'Kết quả cục bộ đạt ngưỡng điểm mạnh theo policy dashboard-v1.',
  }));
  const weaknesses = facts.topics.filter((topic) => topic.status === 'weakness').map((topic) => ({
    key: topic.key,
    label: topic.label,
    status: topic.status,
    accuracy: topic.accuracy,
    correctUnits: topic.correctUnits,
    totalUnits: topic.totalUnits,
    attemptCount: topic.attemptCount,
    confidence: topic.confidence,
    practiceRoute: dashboardTopicRoute(topic.key),
    summary: 'Kết quả cục bộ cho thấy chủ đề này cần được ưu tiên ôn lại.',
  }));
  const notices = buildLocalNotices(facts, source);

  return {
    state: facts.summary.totalAttempts === 0 ? 'empty' : 'ready',
    scope: {
      source,
      range: facts.scope.range,
      timezone: facts.scope.timezone,
      isAuthenticated: facts.scope.ownerFilter === 'authenticated-owner',
      fromDate: facts.scope.fromDate,
      toDateExclusive: facts.scope.toDateExclusive,
    },
    summary: { ...facts.summary },
    recommendations: [createLocalRecommendation(facts)],
    scoreTrend: {
      granularity: 'attempt',
      isComplete: facts.coverage.isComplete && facts.trend.length === facts.coverage.summaryAttemptCount,
      sourceAttemptCount: facts.coverage.summaryAttemptCount,
      points: facts.trend.map((point) => ({
        attemptId: point.attemptId,
        submittedAt: point.submittedAt,
        dateLabel: formatDashboardDateLabel(point.submittedAt),
        score: point.score,
        mode: point.mode === 'TIMED_ORIGINAL' ? 'thi_thu' : 'custom_mock',
        title: point.title,
      })),
    },
    strengths,
    weaknesses,
    questionTypePerformance: facts.questionTypes.map((item) => ({
      ...item,
      label: item.type === 'true_false'
        ? `${formatQuestionTypeLabel(item.type)} theo mệnh đề`
        : formatQuestionTypeLabel(item.type),
      textualSummary: item.type === 'mcq'
        ? `${item.correctUnits}/${item.totalUnits} câu đúng · ${item.blankUnits} câu bỏ trống`
        : `${item.correctUnits}/${item.totalUnits} mệnh đề đúng · ${item.blankUnits} bỏ trống · ${item.partialQuestionCount}/${item.totalQuestionCount} câu làm dở`,
    })),
    cognitivePerformance: facts.cognitiveLevels.map((item) => ({
      ...item,
      label: formatCognitiveLevelLabel(item.level),
      textualSummary: item.accuracy === null
        ? 'Chưa có độ chính xác đáng tin cậy.'
        : `Độ chính xác ${item.accuracy.toLocaleString('vi-VN')}% trên ${item.totalUnits} ý qua ${item.attemptCount} bài.`,
    })),
    recentAttempts: facts.recentAttempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      title: attempt.title,
      mode: attempt.mode === 'TIMED_ORIGINAL' ? 'thi_thu' : 'custom_mock',
      modeLabel: attempt.mode === 'TIMED_ORIGINAL' ? 'Thi thử nguyên đề' : 'Thi thử tùy chọn',
      score: attempt.score,
      durationSeconds: attempt.durationSeconds,
      submittedAt: attempt.submittedAt,
      submittedLabel: formatDashboardSubmittedLabel(attempt.submittedAt),
      totalQuestions: attempt.totalQuestions,
      resultRoute: attempt.resultRouteId
        ? `/exams/ket-qua/${encodeURIComponent(attempt.resultRouteId)}`
        : null,
      detailStatus: attempt.detailStatus === 'full' ? 'full'
        : attempt.detailStatus === 'summary-only' || attempt.detailStatus === 'question-type-only'
          ? 'summary-only'
          : 'unavailable',
    })),
    coverage: {
      summaryAttemptCount: facts.coverage.summaryAttemptCount,
      detailedAttemptCount: facts.coverage.detailedAttemptCount,
      totalKnownAttempts: facts.coverage.totalKnownAttempts,
      fetchLimit: facts.coverage.scanLimit,
      isComplete: facts.coverage.isComplete,
      capturesTimedOriginal: true,
      capturesCustomMock: true,
      capturesPractice: false,
      capturesRetry: false,
      message: `${facts.coverage.detailedAttemptCount}/${facts.coverage.summaryAttemptCount} bài có dữ liệu chi tiết trên thiết bị.`,
    },
    notices,
  };
}
