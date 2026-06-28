/**
 * manifestLoader.ts
 *
 * Fetch + module-level cache cho `exams-manifest.json`.
 * File nhỏ (~24 KB), chỉ cần fetch 1 lần duy nhất per session.
 */
import type { ExamsManifest, ExamManifestEntry } from '@/types/exam';
import { EXAM_MANIFEST_URL } from './examConstants';

let _cache: ExamsManifest | null = null;

/**
 * Load toàn bộ manifest (38 đề). Kết quả được cache module-level.
 */
export async function loadManifest(): Promise<ExamsManifest> {
  if (_cache) return _cache;
  const res = await fetch(EXAM_MANIFEST_URL);
  if (!res.ok) {
    throw new Error(
      `Không tải được manifest (${res.status}). Hãy chạy 'npm run build:data' trước.`
    );
  }
  _cache = (await res.json()) as ExamsManifest;
  return _cache;
}

/**
 * Chỉ trả các đề pass cả 3 verification layers.
 * UI list exam mặc định dùng hàm này.
 */
export async function listPublishedExams(): Promise<ExamManifestEntry[]> {
  const all = await loadManifest();
  return all.filter(
    (e) => e.structuralPassed && e.crossSourcePassed && !e.hasContentSuspicion
  );
}

/**
 * Trả tất cả đề, kể cả có warning — dùng cho admin hoặc "chế độ xem tất cả".
 */
export async function listAllExams(): Promise<ExamsManifest> {
  return loadManifest();
}

/**
 * Trả metadata 1 đề theo examId (không fetch full file).
 * @returns `undefined` nếu không tìm thấy.
 */
export async function getExamMeta(
  examId: string
): Promise<ExamManifestEntry | undefined> {
  const all = await loadManifest();
  return all.find((e) => e.examId === examId);
}

/**
 * Tìm đề theo năm.
 */
export async function listExamsByYear(
  year: number
): Promise<ExamManifestEntry[]> {
  const all = await listPublishedExams();
  return all.filter((e) => e.year === year);
}

/** Xóa cache — dùng khi build:data chạy lại (dev HMR). */
export function clearManifestCache(): void {
  _cache = null;
}
