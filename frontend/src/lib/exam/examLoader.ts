/**
 * examLoader.ts
 *
 * Fetch + LRU cache cho từng file đề thi JSON.
 * Mỗi file ~50–100 KB. Cache tối đa LRU_EXAM_CACHE_CAP files để giới hạn RAM.
 *
 * LRU algorithm: map entry được cập nhật `lastUsed = Date.now()` mỗi lần HIT.
 * Khi cần evict (map.size >= CAP), xóa entry có `lastUsed` nhỏ nhất.
 */
import type { ExamFile, Question, QuestionType } from '@/types/exam';
import { flattenExamQuestions } from '@/types/exam';
import { examFileURL, LRU_EXAM_CACHE_CAP } from './examConstants';

interface CacheEntry {
  data: ExamFile;
  lastUsed: number;
}

const _cache = new Map<string, CacheEntry>();

function evictLRU(): void {
  if (_cache.size < LRU_EXAM_CACHE_CAP) return;
  let lruKey = '';
  let lruTime = Infinity;
  for (const [k, v] of _cache) {
    if (v.lastUsed < lruTime) {
      lruKey = k;
      lruTime = v.lastUsed;
    }
  }
  if (lruKey) _cache.delete(lruKey);
}

/**
 * Load 1 file đề theo examId. Kết quả được LRU-cached.
 * @throws Error nếu fetch thất bại hoặc JSON parse lỗi.
 */
export async function loadExam(examId: string): Promise<ExamFile> {
  const hit = _cache.get(examId);
  if (hit) {
    hit.lastUsed = Date.now(); // cập nhật thời gian sử dụng gần nhất (LRU)
    return hit.data;
  }

  evictLRU();

  const res = await fetch(examFileURL(examId));
  if (!res.ok) {
    throw new Error(`Không tải được đề [${examId}]: HTTP ${res.status}`);
  }
  const data = (await res.json()) as ExamFile;
  _cache.set(examId, { data, lastUsed: Date.now() });
  return data;
}

/**
 * Load nhiều đề cùng lúc (parallel fetch).
 */
export async function loadExams(examIds: string[]): Promise<ExamFile[]> {
  return Promise.all(examIds.map(loadExam));
}

/**
 * Preload đề vào cache (fire-and-forget).
 * Dùng để prefetch khi user hover trên list.
 */
export function preloadExams(examIds: string[]): void {
  for (const id of examIds) {
    if (!_cache.has(id)) void loadExam(id);
  }
}

/**
 * Lấy danh sách câu hỏi từ 1 đề, optional lọc theo questionType.
 * Shorthand tiện dùng ở ExamSessionPage.
 */
export async function getExamQuestions(
  examId: string,
  type?: QuestionType
): Promise<Question[]> {
  const exam = await loadExam(examId);
  return flattenExamQuestions(exam, type);
}

// ===== Cache utils (cho testing / admin) =====================================
export function clearExamCache(): void {
  _cache.clear();
}

export function getExamCacheSize(): number {
  return _cache.size;
}

export function isExamCached(examId: string): boolean {
  return _cache.has(examId);
}
