/**
 * topicIndexLoader.ts
 *
 * Fetch + module-level cache cho `topic-index.json`.
 * File ~343 KB, fetch 1 lần per session.
 *
 * Schema: Record<canonicalTopic, TopicIndexEntry[]>
 * Canonical topic list: 32 topics, xem scripts/lib/topicTaxonomy.mjs.
 */
import type { TopicIndex, TopicIndexEntry } from '@/types/exam';
import { TOPIC_INDEX_URL } from './examConstants';

let _cache: TopicIndex | null = null;

/**
 * Load toàn bộ topic index. Kết quả được cache module-level.
 */
export async function loadTopicIndex(): Promise<TopicIndex> {
  if (_cache) return _cache;
  const res = await fetch(TOPIC_INDEX_URL);
  if (!res.ok) {
    throw new Error(
      `Không tải được topic index (${res.status}). Hãy chạy 'npm run build:data' trước.`
    );
  }
  _cache = (await res.json()) as TopicIndex;
  return _cache;
}

/**
 * Trả danh sách tất cả canonical topic names (sorted theo thứ tự trong index).
 */
export async function listTopics(): Promise<string[]> {
  const idx = await loadTopicIndex();
  return Object.keys(idx);
}

/**
 * Trả danh sách câu hỏi refs thuộc 1 topic.
 * @returns mảng rỗng nếu topic không tồn tại.
 */
export async function getQuestionRefsByTopic(
  topic: string
): Promise<TopicIndexEntry[]> {
  const idx = await loadTopicIndex();
  return idx[topic] ?? [];
}

/**
 * Đếm số câu của từng topic — dùng cho UI hiển thị badge count.
 */
export async function getTopicCounts(): Promise<Record<string, number>> {
  const idx = await loadTopicIndex();
  return Object.fromEntries(
    Object.entries(idx).map(([topic, entries]) => [topic, entries.length])
  );
}

/**
 * Lọc câu hỏi refs theo topic + cognitive level (cho "Ôn theo mức độ").
 */
export async function getQuestionRefsByTopicAndLevel(
  topic: string,
  level: TopicIndexEntry['cognitiveLevel']
): Promise<TopicIndexEntry[]> {
  const refs = await getQuestionRefsByTopic(topic);
  return refs.filter((r) => r.cognitiveLevel === level);
}

export function clearTopicIndexCache(): void {
  _cache = null;
}
