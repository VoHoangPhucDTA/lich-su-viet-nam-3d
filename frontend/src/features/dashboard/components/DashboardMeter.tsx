import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  TrendingUp,
} from 'lucide-react';
import type { InsightStatus } from '../dashboardTypes';

export function DashboardStatusIcon({ status }: { status: InsightStatus }) {
  const props = { size: 13, strokeWidth: 2.2, 'aria-hidden': true } as const;
  if (status === 'strength') return <CheckCircle2 {...props} />;
  if (status === 'weakness') return <AlertTriangle {...props} />;
  if (status === 'developing') return <TrendingUp {...props} />;
  return <CircleHelp {...props} />;
}

export function DashboardMeter({
  label,
  accuracy,
  status,
}: {
  label: string;
  accuracy: number | null;
  status: InsightStatus;
}) {
  if (accuracy === null) {
    return (
      <div
        className={`dashboard-meter dashboard-meter-${status}`}
        role="img"
        aria-label={`${label}: chưa có đủ dữ liệu để tính độ chính xác`}
      >
        <span style={{ width: '0%' }} />
      </div>
    );
  }
  return (
    <div
      className={`dashboard-meter dashboard-meter-${status}`}
      role="progressbar"
      aria-label={`Độ chính xác ${label}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={accuracy}
    >
      <span style={{ width: `${accuracy}%` }} />
    </div>
  );
}
