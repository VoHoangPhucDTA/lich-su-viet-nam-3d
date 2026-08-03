import { Link } from 'react-router-dom';
import type {
  DashboardNotice,
} from '../dashboardTypes';

export function DashboardNoticeBanner({ notice }: { notice: DashboardNotice }) {
  return (
    <section
      className={`dashboard-notice dashboard-notice-${notice.type}`}
      role={notice.type === 'error' ? 'alert' : undefined}
      aria-label={notice.title}
    >
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.message}</p>
      </div>
      {notice.actionLabel && notice.actionRoute && (
        <Link className="dashboard-text-link" to={notice.actionRoute}>{notice.actionLabel}</Link>
      )}
    </section>
  );
}
