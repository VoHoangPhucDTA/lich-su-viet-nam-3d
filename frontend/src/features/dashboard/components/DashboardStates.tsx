import { Link } from 'react-router-dom';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';
import { DashboardInsightSection } from './DashboardInsightSection';
import { DashboardKpiGrid } from './DashboardKpiGrid';
import {
  DashboardNoticeBanner,
} from './DashboardNoticeBanner';
import { splitReadyNotices } from './dashboardNoticeUtils';
import { DashboardQuestionTypePerformance } from './DashboardQuestionTypePerformance';
import { DashboardQuickActions } from './DashboardQuickActions';
import { DashboardRecentAttempts } from './DashboardRecentAttempts';
import { DashboardRecommendationCard } from './DashboardRecommendationCard';
import { DashboardScoreTrend } from './DashboardScoreTrend';
import { DashboardUtilityRail } from './DashboardUtilityRail';

export function DashboardLoadingState() {
  return (
    <main className="dashboard-content" aria-busy="true">
      <p className="dashboard-live-status" role="status">Đang tải thống kê học tập…</p>
      <div className="dashboard-skeleton dashboard-skeleton-layout" aria-hidden="true">
        <div className="dashboard-skeleton-main">
          <div className="dashboard-skeleton-recommendation" />
          <div className="dashboard-skeleton-kpis">{Array.from({ length: 4 }, (_, index) => <div key={index} className="dashboard-skeleton-card" />)}</div>
          <div className="dashboard-skeleton-chart" />
          <div className="dashboard-skeleton-insight" />
          <div className="dashboard-skeleton-question" />
          <div className="dashboard-skeleton-history" />
        </div>
        <aside className="dashboard-skeleton-utility">
          <div className="dashboard-skeleton-utility-card" />
          <div className="dashboard-skeleton-cognitive" />
          <div className="dashboard-skeleton-coverage" />
          <div className="dashboard-skeleton-actions" />
        </aside>
      </div>
    </main>
  );
}

export function DashboardErrorState({
  vm,
  onRetry,
}: {
  vm: PersonalLearningDashboardViewModel;
  onRetry: () => void;
}) {
  const notice = vm.notices.find((item) => item.type === 'error');
  return (
    <main className="dashboard-content dashboard-state-content">
      <section className="dashboard-card dashboard-state-card dashboard-error-state" role="alert" aria-labelledby="dashboard-error-title">
        <h2 id="dashboard-error-title">{notice?.title ?? 'Không thể tải thống kê học tập'}</h2>
        <p>{notice?.message ?? 'Dữ liệu thống kê hiện không khả dụng. Hãy thử tải lại hoặc tiếp tục với một đề thi mới.'}</p>
        <div className="dashboard-state-actions">
          <button className="dashboard-primary-action" type="button" onClick={onRetry}>Thử lại</button>
          <Link className="dashboard-secondary-action" to={notice?.actionRoute ?? '/exams/browse'}>
            {notice?.actionLabel ?? 'Duyệt kho đề'}
          </Link>
        </div>
      </section>
    </main>
  );
}

export function DashboardEmptyState({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const recommendation = vm.recommendations[0];
  const isAnonymous = vm.notices.some((notice) => notice.id === 'authentication-required');
  const nonDuplicateNotices = vm.notices.filter((notice) => (
    notice.id !== 'empty-state' && notice.id !== 'authentication-required'
  ));
  return (
    <main className="dashboard-content dashboard-state-content">
      {nonDuplicateNotices.map((notice) => <DashboardNoticeBanner key={notice.id} notice={notice} />)}
      <section className="dashboard-card dashboard-state-card" aria-labelledby="dashboard-empty-title">
        <h2 id="dashboard-empty-title">
          {isAnonymous ? 'Đăng nhập để xem thống kê học tập' : 'Chưa có bài thi nào'}
        </h2>
        <p>{isAnonymous
          ? 'Không có kết quả anonymous đã được xác nhận trên thiết bị này. Đăng nhập để xem dữ liệu đã lưu trên máy chủ.'
          : 'Hoàn thành một đề thi thử để bắt đầu theo dõi kết quả học tập.'}</p>
        {recommendation && <Link className="dashboard-primary-action" to={recommendation.actionRoute}>{recommendation.actionLabel}</Link>}
      </section>
      <DashboardQuickActions vm={vm} />
    </main>
  );
}

export function DashboardReadyState({
  vm,
  onRetry,
}: {
  vm: PersonalLearningDashboardViewModel;
  onRetry: () => void;
}) {
  const { primary, secondary } = splitReadyNotices(vm);
  const isLocalFallback = vm.scope.source === 'local-fallback';
  return (
    <main className="dashboard-content">
      {primary.length > 0 && (
        <div className="dashboard-notice-stack">
          {primary.map((notice) => <DashboardNoticeBanner key={notice.id} notice={notice} />)}
        </div>
      )}
      {secondary.length > 0 && (
        <details className="dashboard-notice-details">
          <summary>Chi tiết về nguồn dữ liệu ({secondary.length})</summary>
          <div className="dashboard-notice-stack">
            {secondary.map((notice) => <DashboardNoticeBanner key={notice.id} notice={notice} />)}
          </div>
        </details>
      )}
      {isLocalFallback && (
        <div className="dashboard-fallback-actions">
          <button className="dashboard-secondary-action" type="button" onClick={onRetry}>
            Thử kết nối máy chủ lại
          </button>
        </div>
      )}
      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          <DashboardRecommendationCard vm={vm} />
          <DashboardKpiGrid vm={vm} />
          <DashboardScoreTrend vm={vm} />
          <DashboardInsightSection vm={vm} />
          <DashboardQuestionTypePerformance items={vm.questionTypePerformance} />
          <DashboardRecentAttempts items={vm.recentAttempts} />
        </div>
        <DashboardUtilityRail vm={vm} />
      </div>
    </main>
  );
}
