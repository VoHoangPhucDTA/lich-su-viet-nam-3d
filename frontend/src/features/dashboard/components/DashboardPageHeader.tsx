import type {
  DashboardRange,
  PersonalLearningDashboardViewModel,
} from '../dashboardTypes';

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '90d', label: '90 ngày' },
  { value: 'all', label: 'Tất cả' },
];

function sourceLabel(source: PersonalLearningDashboardViewModel['scope']['source']) {
  if (source === 'local') return 'Thiết bị này';
  if (source === 'backend') return 'Máy chủ';
  if (source === 'local-fallback') return 'Dữ liệu cục bộ dự phòng';
  return 'Dữ liệu đã hợp nhất';
}

export function DashboardTimeRangeFilter({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
}) {
  return (
    <div className="dashboard-range" role="radiogroup" aria-label="Khoảng thời gian thống kê">
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const index = RANGE_OPTIONS.findIndex(candidate => candidate.value === value);
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              onChange(RANGE_OPTIONS[(index + 1) % RANGE_OPTIONS.length]!.value);
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              onChange(RANGE_OPTIONS[(index - 1 + RANGE_OPTIONS.length) % RANGE_OPTIONS.length]!.value);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function DashboardPageHeader({
  vm,
  range,
  onRangeChange,
}: {
  vm: PersonalLearningDashboardViewModel;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
}) {
  const from = vm.scope.fromDate ? `Từ ${vm.scope.fromDate}` : 'Toàn bộ thời gian';
  const showScope = vm.state !== 'loading'
    && !vm.notices.some(notice => notice.id === 'authentication-required');
  return (
    <header className="dashboard-page-header">
      <div className="dashboard-heading-copy">
        <p className="dashboard-eyebrow">Luyện thi THPT</p>
        <h1>Tổng quan học tập</h1>
        <p>Nhìn lại kết quả, hiểu phần cần cải thiện và chọn bước ôn tập tiếp theo.</p>
        {showScope && (
          <p className="dashboard-scope-line">
            {from} · đến trước {vm.scope.toDateExclusive} · {sourceLabel(vm.scope.source)}
          </p>
        )}
      </div>
      <DashboardTimeRangeFilter value={range} onChange={onRangeChange} />
    </header>
  );
}
