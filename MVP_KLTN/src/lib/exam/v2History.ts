/**
 * v2History.ts
 *
 * Đọc / tổng hợp lịch sử làm bài V2 từ localStorage.
 * Mỗi kết quả được lưu bởi `writeResultToLS(result)` trong useSessionV2.ts
 * với key `v2_result_{sessionId}`.
 *
 * Không dùng index riêng — scan tất cả key với prefix để không mất sync.
 */
import type { ExamResultV2 } from '@/types/exam';

const RESULT_PREFIX = 'v2_result_';

/** Lấy toàn bộ kết quả V2 từ localStorage, sort mới nhất trước. */
export function getAllV2Results(): ExamResultV2[] {
  const results: ExamResultV2[] = [];
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(RESULT_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      results.push(JSON.parse(raw) as ExamResultV2);
    } catch {
      // Bỏ qua entry bị corrupt
    }
  }
  return results.sort((a, b) => b.submittedAt - a.submittedAt);
}

export interface V2Stats {
  count: number;
  avgScore: number;
  maxScore: number;
  /** Tổng thời gian ôn (giờ, 1 chữ số thập phân). */
  totalHours: number;
}

/**
 * Tính thống kê tổng hợp. Trả `null` nếu chưa có kết quả nào.
 */
export function getV2Stats(): V2Stats | null {
  const results = getAllV2Results();
  if (results.length === 0) return null;

  const scores = results.map((r) => r.totalScore);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const totalSecs = results.reduce((a, r) => a + r.durationSeconds, 0);

  return {
    count: results.length,
    avgScore: Math.round(avg * 10) / 10,
    maxScore: Math.round(max * 10) / 10,
    totalHours: Math.round((totalSecs / 3600) * 10) / 10,
  };
}

/** Xóa toàn bộ kết quả V2 (dùng cho nút "Xóa lịch sử"). */
export function clearAllV2Results(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(RESULT_PREFIX)) localStorage.removeItem(key);
  }
}
