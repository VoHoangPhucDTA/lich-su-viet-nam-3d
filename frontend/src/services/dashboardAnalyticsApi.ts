import type {
  DashboardAnalyticsRange,
  DashboardAnalyticsResponseV1,
} from '@/features/dashboard/dashboardAnalyticsTypes';
import { validateDashboardAnalyticsResponseV1 } from '@/features/dashboard/dashboardAnalyticsValidation';
import { ApiRequestError, apiGet, toQueryString } from './apiClient';

export type DashboardAnalyticsErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-request'
  | 'contract'
  | 'transport'
  | 'timeout'
  | 'aborted'
  | 'server'
  | 'unknown';

export class DashboardAnalyticsApiError extends Error {
  readonly kind: DashboardAnalyticsErrorKind;
  readonly status: number;

  constructor(kind: DashboardAnalyticsErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'DashboardAnalyticsApiError';
    this.kind = kind;
    this.status = status;
  }
}

export type DashboardAnalyticsRequest = (
  range: DashboardAnalyticsRange,
  signal?: AbortSignal,
) => Promise<DashboardAnalyticsResponseV1>;

function classifyApiRequestError(error: ApiRequestError): DashboardAnalyticsApiError {
  if (error.status === 401) {
    return new DashboardAnalyticsApiError('unauthenticated', 'Phiên đăng nhập đã hết hạn.', 401);
  }
  if (error.status === 403) {
    return new DashboardAnalyticsApiError('forbidden', 'Tài khoản không có quyền xem thống kê này.', 403);
  }
  if (error.status === 400) {
    return new DashboardAnalyticsApiError('invalid-request', 'Khoảng thống kê không hợp lệ.', 400);
  }
  if (error.status >= 500) {
    return new DashboardAnalyticsApiError('server', 'Máy chủ thống kê đang tạm thời không khả dụng.', error.status);
  }
  return new DashboardAnalyticsApiError('unknown', 'Không thể tải thống kê học tập.', error.status);
}

export async function getDashboardAnalytics(
  range: DashboardAnalyticsRange,
  signal?: AbortSignal,
): Promise<DashboardAnalyticsResponseV1> {
  try {
    const payload = await apiGet<unknown>(
      `/api/exams/dashboard-analytics${toQueryString({ range, recentLimit: 5 })}`,
      { signal },
    );
    const validation = validateDashboardAnalyticsResponseV1(payload);
    if (!validation.success) {
      if (import.meta.env.DEV) {
        console.error('[dashboard-analytics] Contract validation failed:', validation.issues.join(' '));
      }
      throw new DashboardAnalyticsApiError(
        'contract',
        'Phản hồi thống kê không đúng định dạng Dashboard Analytics V1.',
      );
    }
    return validation.data;
  } catch (error) {
    if (error instanceof DashboardAnalyticsApiError) throw error;
    if (error instanceof ApiRequestError) throw classifyApiRequestError(error);
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new DashboardAnalyticsApiError('timeout', 'Yêu cầu thống kê đã quá thời gian chờ.');
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new DashboardAnalyticsApiError('aborted', 'Yêu cầu thống kê đã bị hủy.');
    }
    if (error instanceof TypeError) {
      throw new DashboardAnalyticsApiError('transport', 'Không thể kết nối đến máy chủ thống kê.');
    }
    throw new DashboardAnalyticsApiError('unknown', 'Không thể tải thống kê học tập.');
  }
}
