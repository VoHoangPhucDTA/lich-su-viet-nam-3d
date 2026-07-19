import { loadStoredUser } from '@/services/apiClient';
import { getExamApiErrorCode, isExamApiFallbackError, recoverExamSubmission } from '@/services/examApi';
import type { RecoverExamSubmissionRequest } from '@/types/examApi';

const KEY = 'exam_submission_recovery_queue_v1';
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
let activeFlush: Promise<{ recovered: number; pending: number }> | null = null;

export type RecoverySyncStatus = 'PENDING' | 'SYNCING' | 'BACKEND_SCORED' | 'VERSION_MISMATCH' | 'AUTH_MISMATCH' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT';

export interface RecoveryQueueItem {
  storageVersion: 1;
  queuedAt: number;
  ownerId: string;
  request: RecoverExamSubmissionRequest;
  /** Immutable local result is retained even if the backend can never verify it. */
  localResult?: unknown;
  syncStatus: RecoverySyncStatus;
  retryCount: number;
  lastRetryAt?: number;
  lastErrorCode?: string;
}

function readAll(): RecoveryQueueItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is RecoveryQueueItem => Boolean(item) && typeof item === 'object' && (item as RecoveryQueueItem).storageVersion === 1) : [];
  } catch { return []; }
}

function writeAll(items: RecoveryQueueItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function isRetryDue(item: RecoveryQueueItem, now: number): boolean {
  if (item.syncStatus !== 'FAILED_RETRYABLE' || !item.lastRetryAt) return true;
  const exponent = Math.max(0, item.retryCount - 1);
  const delay = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** exponent));
  return now - item.lastRetryAt >= delay;
}

/** Anonymous results intentionally stay local: recovery must not attach them after a later login. */
export function enqueueRecovery(request: RecoverExamSubmissionRequest, localResult?: unknown): boolean {
  const owner = loadStoredUser();
  if (!owner) return false;
  const items = readAll();
  const existing = items.findIndex((item) => item.ownerId === owner.id && item.request.clientSubmissionId === request.clientSubmissionId);
  const entry: RecoveryQueueItem = { storageVersion: 1, queuedAt: Date.now(), ownerId: owner.id, request, localResult, syncStatus: 'PENDING', retryCount: 0 };
  if (existing >= 0) items[existing] = { ...items[existing], request, queuedAt: Date.now() };
  else items.push(entry);
  writeAll(items);
  return true;
}

export function pendingRecoveryCount(): number {
  const owner = loadStoredUser();
  return owner ? readAll().filter((item) => item.ownerId === owner.id && !['BACKEND_SCORED', 'VERSION_MISMATCH', 'AUTH_MISMATCH', 'FAILED_PERMANENT'].includes(item.syncStatus)).length : 0;
}

export async function flushRecoveryQueue(): Promise<{ recovered: number; pending: number }> {
  if (activeFlush) return activeFlush;
  activeFlush = flushRecoveryQueueInternal();
  try { return await activeFlush; } finally { activeFlush = null; }
}

async function flushRecoveryQueueInternal(): Promise<{ recovered: number; pending: number }> {
  const owner = loadStoredUser();
  if (!owner) return { recovered: 0, pending: 0 };
  const all = readAll();
  const next: RecoveryQueueItem[] = [];
  let recovered = 0;
  for (const item of all) {
    if (item.ownerId !== owner.id || ['BACKEND_SCORED', 'VERSION_MISMATCH', 'AUTH_MISMATCH', 'FAILED_PERMANENT'].includes(item.syncStatus)) { next.push(item); continue; }
    if (!isRetryDue(item, Date.now())) { next.push(item); continue; }
    try {
      const syncing = { ...item, syncStatus: 'SYNCING' as const, lastRetryAt: Date.now() };
      next.push(syncing);
      writeAll([...next, ...all.slice(all.indexOf(item) + 1)]);
      await recoverExamSubmission(item.request);
      next[next.length - 1] = { ...syncing, syncStatus: 'BACKEND_SCORED' };
      recovered += 1;
    } catch (error) {
      const code = getExamApiErrorCode(error) ?? undefined;
      const syncStatus: RecoverySyncStatus = code === 'VERSION_MISMATCH' ? 'VERSION_MISMATCH'
        : code === 'RECOVERY_OWNER_REQUIRED' || code === 'AUTH_MISMATCH' ? 'AUTH_MISMATCH'
        : isExamApiFallbackError(error) ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT';
      next[next.length - 1] = { ...item, syncStatus, retryCount: item.retryCount + 1, lastRetryAt: Date.now(), lastErrorCode: code };
      if (isExamApiFallbackError(error)) {
        next.push(...all.slice(all.indexOf(item) + 1));
        break;
      }
    }
  }
  const deduped = [...new Map(next.map((item) => [`${item.ownerId}:${item.request.clientSubmissionId}`, item])).values()];
  writeAll(deduped);
  return {
    recovered,
    pending: deduped.filter((item) => item.ownerId === owner.id
      && !['BACKEND_SCORED', 'VERSION_MISMATCH', 'AUTH_MISMATCH', 'FAILED_PERMANENT'].includes(item.syncStatus)).length,
  };
}

export async function createLocalSubmissionHash(value: unknown): Promise<string> {
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `unverified-${bytes.length}`;
}
