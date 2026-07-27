import type { DashboardNotice } from './dashboardTypes';

export function createDeviceUnscopedExcludedNotice(): DashboardNotice {
  return {
    id: 'device-unscoped-excluded',
    type: 'info',
    title: 'Một số dữ liệu cũ không được tính',
    message: 'Một số kết quả cũ trên thiết bị đã bị loại khỏi thống kê vì không xác định được chủ sở hữu.',
    actionLabel: null,
    actionRoute: null,
  };
}
