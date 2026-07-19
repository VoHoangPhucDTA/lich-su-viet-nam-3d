import type { MockEventDetail } from '../data/mockEventDetails';
import { getEventDetailFromBackend } from './eventApi';

/** Một số id/slug rút gọn được dùng trong code/UI cũ → trỏ về id mới trong JSON. */
const ALIAS_MAP: Record<string, string> = {
  // Giữ alias cho code cũ – nếu trùng thì đã match trực tiếp ở registry
};

/** Mô phỏng độ trễ mạng nhỏ để hiển thị skeleton/loader đẹp hơn. */
const FAKE_LATENCY_MS = 80;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const getEventDetailBySlug = async (
  slugOrId: string
): Promise<MockEventDetail | null> => {
  await sleep(FAKE_LATENCY_MS);

  const resolvedKey = ALIAS_MAP[slugOrId] ?? slugOrId;
  const backendEvent = await getEventDetailFromBackend(resolvedKey);
  if (backendEvent) return backendEvent;

  return null;
};
