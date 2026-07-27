import { ApiRequestError, apiGet } from './apiClient';

export interface ProfileLearningSummaryV1 {
  schemaVersion: 1;
  generatedAt: string;
  timezone: 'Asia/Ho_Chi_Minh';
  eventsViewed: number;
  quizzesCompleted: number;
  totalMinutes: number;
  streakDays: number;
}

export type ProfileLearningSummaryRequest = (
  signal?: AbortSignal,
) => Promise<ProfileLearningSummaryV1>;

export class ProfileLearningSummaryApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ProfileLearningSummaryApiError';
    this.status = status;
  }
}

const EXPECTED_KEYS = [
  'schemaVersion',
  'generatedAt',
  'timezone',
  'eventsViewed',
  'quizzesCompleted',
  'totalMinutes',
  'streakDays',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function parseProfileLearningSummaryV1(value: unknown): ProfileLearningSummaryV1 {
  if (!isObject(value)) {
    throw new ProfileLearningSummaryApiError('Dữ liệu tổng quan hồ sơ không hợp lệ.');
  }
  const keys = Object.keys(value).sort();
  const expected = [...EXPECTED_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ProfileLearningSummaryApiError('Dữ liệu tổng quan hồ sơ không đúng hợp đồng V1.');
  }
  if (
    value.schemaVersion !== 1
    || value.timezone !== 'Asia/Ho_Chi_Minh'
    || typeof value.generatedAt !== 'string'
    || Number.isNaN(Date.parse(value.generatedAt))
    || !isNonNegativeInteger(value.eventsViewed)
    || !isNonNegativeInteger(value.quizzesCompleted)
    || !isNonNegativeInteger(value.totalMinutes)
    || !isNonNegativeInteger(value.streakDays)
  ) {
    throw new ProfileLearningSummaryApiError('Dữ liệu tổng quan hồ sơ không đúng hợp đồng V1.');
  }
  return value as unknown as ProfileLearningSummaryV1;
}

export async function getProfileLearningSummary(
  signal?: AbortSignal,
): Promise<ProfileLearningSummaryV1> {
  try {
    const payload = await apiGet<unknown>('/api/progress/me/learning-summary', { signal });
    return parseProfileLearningSummaryV1(payload);
  } catch (error) {
    if (error instanceof ProfileLearningSummaryApiError) throw error;
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        throw new ProfileLearningSummaryApiError('Phiên đăng nhập đã hết hạn.', 401);
      }
      throw new ProfileLearningSummaryApiError('Không thể tải tổng quan học tập.', error.status);
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ProfileLearningSummaryApiError('Không thể kết nối đến máy chủ.');
  }
}
