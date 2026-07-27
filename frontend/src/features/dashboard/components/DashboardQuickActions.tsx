import {
  ArrowRight,
  BookOpen,
  History,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';

export function DashboardQuickActions({
  vm,
  embedded = false,
}: {
  vm: PersonalLearningDashboardViewModel;
  embedded?: boolean;
}) {
  const topicRoute = vm.recommendations.find((item) => item.topicKey)?.actionRoute
    ?? vm.weaknesses.find((item) => item.practiceRoute)?.practiceRoute;
  const actions = [
    { label: 'Duyệt kho đề', description: 'Chọn một đề thi phù hợp', route: '/exams/browse', icon: <BookOpen aria-hidden="true" /> },
    { label: 'Tạo đề tùy chọn', description: 'Tự chọn cấu trúc bài thi', route: '/exams/tao-de', icon: <SlidersHorizontal aria-hidden="true" /> },
    ...(topicRoute ? [{ label: 'Ôn chủ đề yếu', description: 'Luyện phần cần cải thiện', route: topicRoute, icon: <Target aria-hidden="true" /> }] : []),
    { label: 'Xem toàn bộ lịch sử', description: 'Mở danh sách bài đã làm', route: '/exams/lich-su', icon: <History aria-hidden="true" /> },
  ];
  const unique = actions.filter((item, index) => actions.findIndex((candidate) => candidate.route === item.route) === index);
  return (
    <nav className={`dashboard-card dashboard-quick-actions${embedded ? ' dashboard-actions-card' : ''}`} aria-labelledby="dashboard-actions-title">
      <div className="dashboard-rail-heading">
        <span><Target aria-hidden="true" /></span>
        <div><p className="dashboard-section-kicker">Tiếp tục học</p><h2 id="dashboard-actions-title">Bước tiếp theo</h2></div>
      </div>
      <ul>{unique.map((action) => (
        <li key={action.route}>
          <Link to={action.route}>
            <span className="dashboard-action-icon">{action.icon}</span>
            <span className="dashboard-action-copy"><strong>{action.label}</strong><span>{action.description}</span></span>
            <ArrowRight className="dashboard-action-arrow" aria-hidden="true" />
          </Link>
        </li>
      ))}</ul>
    </nav>
  );
}
