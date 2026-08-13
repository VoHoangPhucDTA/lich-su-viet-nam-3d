import type { InsightStatus } from '../dashboardTypes';

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
