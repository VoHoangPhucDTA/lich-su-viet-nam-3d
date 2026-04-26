import type { MockEventDetail } from '../data/mockEventDetails';
import {
  findRawEventByIdOrSlug,
  getRawEventById,
} from '../data/eventRegistry';
import { rawToEventDetail } from '../data/eventAdapter';

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
  const raw = findRawEventByIdOrSlug(resolvedKey);
  if (!raw) return null;
  return rawToEventDetail(raw);
};

export const getChildrenEvents = async (
  childIds: string[]
): Promise<MockEventDetail[]> => {
  await sleep(FAKE_LATENCY_MS);

  return childIds
    .map((id) => getRawEventById(id) ?? findRawEventByIdOrSlug(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(rawToEventDetail);
};

export const getRelatedEvents = async (
  ids: string[]
): Promise<MockEventDetail[]> => {
  await sleep(FAKE_LATENCY_MS);

  return ids
    .map((id) => getRawEventById(id) ?? findRawEventByIdOrSlug(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(rawToEventDetail);
};
