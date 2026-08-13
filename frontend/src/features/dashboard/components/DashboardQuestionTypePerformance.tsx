import { classifyDashboardInsightByUnits } from '../dashboardAnalyticsPolicy';
import type { QuestionTypePerformance } from '../dashboardTypes';
import { DashboardMeter } from './DashboardMeter';

function QuestionTypeItem({ item }: { item: QuestionTypePerformance }) {
  const status = classifyDashboardInsightByUnits(item.accuracy, item.totalUnits);
  const summary = item.type === 'mcq'
    ? `${item.correctUnits}/${item.totalUnits} câu đúng · ${item.blankUnits} câu bỏ trống`
    : `${item.correctUnits}/${item.totalUnits} mệnh đề đúng · ${item.blankUnits} bỏ trống · ${item.partialQuestionCount}/${item.totalQuestionCount} câu làm dở`;
  return (
    <li className={`dashboard-performance-item dashboard-performance-${status}`}>
      <div className="dashboard-performance-title">
        <h3>{item.label}</h3>
        <strong className={`dashboard-accuracy dashboard-accuracy-${status}`}>{item.accuracy === null ? '—' : `${item.accuracy.toLocaleString('vi-VN')}%`}</strong>
      </div>
      <DashboardMeter label={item.label} accuracy={item.accuracy} status={status} />
      <p>{summary}</p>
    </li>
  );
}

export function DashboardQuestionTypePerformance({ items }: { items: QuestionTypePerformance[] }) {
  return (
    <section className="dashboard-card dashboard-performance-card dashboard-question-type-card" aria-labelledby="dashboard-question-type-title">
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-section-kicker">Chi tiết năng lực</p>
          <h2 id="dashboard-question-type-title">Hiệu suất theo dạng câu</h2>
          <p className="dashboard-section-description">So sánh độ chính xác giữa hai cấu trúc câu hỏi trong bài thi.</p>
        </div>
      </div>
      {items.length ? <ul>{items.map((item) => <QuestionTypeItem key={item.type} item={item} />)}</ul> : <p>Chưa có dữ liệu chi tiết theo dạng câu.</p>}
    </section>
  );
}
