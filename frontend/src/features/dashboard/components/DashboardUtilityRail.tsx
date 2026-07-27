import {
  Activity,
  CalendarDays,
  Clock3,
  Gauge,
} from 'lucide-react';
import { formatDashboardDuration } from '../dashboardFormatters';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';
import { DashboardCognitivePerformance } from './DashboardCognitivePerformance';
import { DashboardQuickActions } from './DashboardQuickActions';

function coverageNote(source: PersonalLearningDashboardViewModel['scope']['source']): string {
  if (source === 'backend') {
    return 'Điểm do máy chủ chấm và lưu cùng bản ghi bài làm.';
  }
  if (source === 'local-fallback') {
    return 'Điểm đọc từ bản lưu dự phòng trên thiết bị, chưa được máy chủ xác nhận lại.';
  }
  return 'Điểm tính từ dữ liệu trên thiết bị này, chỉ phục vụ mục đích học tập.';
}

export function DashboardUtilityRail({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  const coverage = vm.coverage;
  return (
    <aside
      className="dashboard-utility dashboard-utility-surface"
      aria-label="Tóm tắt và hành động nhanh"
    >
      <section className="dashboard-card dashboard-activity-card" aria-labelledby="dashboard-utility-title">
        <div className="dashboard-rail-heading">
          <span><Activity aria-hidden="true" /></span>
          <div><p className="dashboard-section-kicker">Hoạt động trong kỳ</p><h2 id="dashboard-utility-title">Nhịp học tập</h2></div>
        </div>
        <div className="dashboard-activity-stats">
          <article><CalendarDays aria-hidden="true" /><strong>{vm.summary.activeDays}</strong><span>ngày hoạt động</span></article>
          <article><Clock3 aria-hidden="true" /><strong>{formatDashboardDuration(vm.summary.totalDurationSeconds)}</strong><span>tổng thời gian</span></article>
        </div>
        <p className="dashboard-rail-note">Số ngày có bài thi trong kỳ đã chọn.</p>
      </section>
      <DashboardCognitivePerformance items={vm.cognitivePerformance} />
      <section className="dashboard-card dashboard-coverage" aria-labelledby="dashboard-coverage-title">
        <div className="dashboard-rail-heading">
          <span><Gauge aria-hidden="true" /></span>
          <div><p className="dashboard-section-kicker">Nguồn số liệu</p><h2 id="dashboard-coverage-title">Phạm vi dữ liệu</h2></div>
        </div>
        <dl>
          <div><dt>Tổng bài</dt><dd>{coverage.totalKnownAttempts}</dd></div>
          <div><dt>Đủ dữ liệu chi tiết</dt><dd>{coverage.detailedAttemptCount}</dd></div>
          <div><dt>Bài nguồn biểu đồ</dt><dd>{vm.scoreTrend.sourceAttemptCount}</dd></div>
          <div><dt>Điểm trên biểu đồ</dt><dd>{vm.scoreTrend.points.length}</dd></div>
        </dl>
        <p className="dashboard-coverage-note">{coverageNote(vm.scope.source)}</p>
      </section>
      <DashboardQuickActions vm={vm} embedded />
    </aside>
  );
}
