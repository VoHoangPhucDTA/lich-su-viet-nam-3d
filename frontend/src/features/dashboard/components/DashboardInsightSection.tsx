import { Link } from 'react-router-dom';
import type {
  LearningInsight,
  PersonalLearningDashboardViewModel,
} from '../dashboardTypes';
import { statusLabels } from './dashboardDisplayLabels';
import { DashboardMeter } from './DashboardMeter';

function insightCaution(item: LearningInsight) {
  const summary = item.summary.toLocaleLowerCase('vi-VN');
  if (item.confidence === 'low' || summary.includes('mẫu còn ít')) return 'Mẫu dữ liệu còn ít.';
  if (summary.includes('dữ liệu chi tiết') || summary.includes('phần dữ liệu')) {
    return 'Chỉ phản ánh phần dữ liệu chi tiết hiện có.';
  }
  if (summary.includes('thận trọng') || summary.includes('chưa đầy đủ')) return item.summary;
  return null;
}

function DashboardInsightItem({
  item,
  interactive = false,
}: {
  item: LearningInsight;
  interactive?: boolean;
}) {
  const caution = insightCaution(item);
  return (
    <li className={`dashboard-insight-item dashboard-insight-${item.status}`}>
      <div className="dashboard-insight-topline">
        <div className="dashboard-insight-name">
          <h3>{interactive && item.practiceRoute
            ? <Link className="dashboard-topic-link" to={item.practiceRoute}>{item.label}</Link>
            : item.label}</h3>
          <span className={`dashboard-status dashboard-status-${item.status}`}>
            {statusLabels[item.status]}
          </span>
        </div>
        <div className="dashboard-insight-result">
          <strong className={`dashboard-accuracy dashboard-accuracy-${item.status}`}>{item.accuracy.toLocaleString('vi-VN')}%</strong>
        </div>
      </div>
      <DashboardMeter label={item.label} accuracy={item.accuracy} status={item.status} />
      <p className="dashboard-insight-meta">{item.correctUnits}/{item.totalUnits} ý · {item.attemptCount} bài</p>
      {caution && <p className="dashboard-caution">{caution}</p>}
    </li>
  );
}

export function DashboardInsightSection({ vm }: { vm: PersonalLearningDashboardViewModel }) {
  if (vm.strengths.length === 0 && vm.weaknesses.length === 0) {
    return (
      <section className="dashboard-card dashboard-empty-section dashboard-insight-insufficient" aria-labelledby="dashboard-insight-title">
        <p className="dashboard-section-kicker">Phân tích chủ đề</p>
        <h2 id="dashboard-insight-title">Điểm mạnh và nội dung cần cải thiện</h2>
        <p>Chưa đủ dữ liệu để gắn nhãn. Cần ít nhất 8 ý trả lời trong ít nhất 2 bài.</p>
      </section>
    );
  }
  const showStrengths = vm.strengths.length > 0;
  const showWeaknesses = vm.weaknesses.length > 0;
  return (
    <section className="dashboard-card dashboard-insight-surface" aria-labelledby="dashboard-insight-title">
      <div className="dashboard-section-heading dashboard-insight-heading">
        <div>
          <p className="dashboard-section-kicker">Phân tích chủ đề</p>
          <h2 id="dashboard-insight-title">Điểm mạnh và nội dung cần cải thiện</h2>
          <p className="dashboard-section-description">Những chủ đề nổi bật và phần nên ưu tiên trong lượt ôn tiếp theo.</p>
        </div>
      </div>
      <div className={`dashboard-two-column${showStrengths && showWeaknesses ? '' : ' dashboard-two-column-single'} dashboard-insight-grid`}>
        {showStrengths && (
          <div className="dashboard-insight-group dashboard-insight-group-strength">
            <h3><span>Điểm mạnh</span><small>{vm.strengths.length} chủ đề · từ 80%</small></h3>
            <ul>{vm.strengths.map((item) => <DashboardInsightItem key={item.key} item={item} />)}</ul>
          </div>
        )}
        {showWeaknesses && (
          <div className="dashboard-insight-group dashboard-insight-group-weakness">
            <h3><span>Cần cải thiện</span><small>{vm.weaknesses.length} chủ đề · dưới 60%</small></h3>
            <ul>{vm.weaknesses.map((item) => <DashboardInsightItem key={item.key} item={item} interactive />)}</ul>
            {vm.weaknesses[0].practiceRoute && (
              <Link className="dashboard-weakness-action" to={vm.weaknesses[0].practiceRoute}>
                Ôn các chủ đề yếu
              </Link>
            )}
          </div>
        )}
        {!showStrengths && showWeaknesses && (
          <p className="dashboard-insight-note">Chưa có chủ đề nào đạt ngưỡng điểm mạnh trong dữ liệu hiện tại.</p>
        )}
      </div>
    </section>
  );
}
