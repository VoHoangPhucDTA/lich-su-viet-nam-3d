import {
  adaptApiSnapshotV2LocalResult,
  adaptRecoveryLocalResult,
  adaptV2LegacyLocalResult,
} from './localDashboardAdapters';
import type {
  LocalDashboardAdapterResult,
  LocalDashboardAttemptV1,
  LocalDashboardOwnerFilter,
  LocalDashboardOwnerScope,
  LocalDashboardRecoveryMetadata,
  LocalDashboardScanDiagnostics,
  LocalDashboardScanOptions,
  LocalDashboardScanResult,
  LocalDashboardSourceKind,
} from './localDashboardTypes';
import { isRecord } from './localDashboardGuards';

export const LOCAL_DASHBOARD_MAX_MATCHING_KEYS = 1_000;
export const LOCAL_DASHBOARD_MAX_NORMALIZED_ATTEMPTS = 500;
/** Current immutable snapshots are normally well below this; 2 MiB leaves headroom without unbounded parsing. */
export const LOCAL_DASHBOARD_MAX_PAYLOAD_CHARACTERS = 2 * 1024 * 1024;

export const LOCAL_DASHBOARD_RECOVERY_KEY = 'exam_submission_recovery_queue_v1';
const RECOVERY_KEY = LOCAL_DASHBOARD_RECOVERY_KEY;
const PREFIXES = [
  'exam_api_result_',
  'v2_result_',
] as const;
const EXACT_KEYS = new Set([RECOVERY_KEY]);
const PREFIX_PRIORITY: Record<string, number> = {
  'exam_api_result_': 3,
  'v2_result_': 2,
};
const TERMINAL_RECOVERY_STATES = new Set([
  'BACKEND_SCORED',
  'VERSION_MISMATCH',
  'AUTH_MISMATCH',
  'FAILED_PERMANENT',
]);

export type LocalDashboardStorage = Pick<Storage, 'length' | 'key' | 'getItem'>;
type LocalDashboardStoredEntry = { key: string; value: unknown };

function isAllowedKey(key: string): boolean {
  return EXACT_KEYS.has(key) || PREFIXES.some((prefix) => key.startsWith(prefix));
}

function keyPriority(key: string): number {
  if (EXACT_KEYS.has(key)) return 4;
  for (const [prefix, priority] of Object.entries(PREFIX_PRIORITY)) {
    if (key.startsWith(prefix)) return priority;
  }
  return 0;
}

/**
 * Storage-event predicate shared with the source orchestration. It only inspects
 * the key; callers must not parse StorageEvent.newValue.
 */
export function isLocalDashboardStorageKey(key: string | null): boolean {
  return key === null || isAllowedKey(key);
}

function safeParse(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

function readEntries(
  storage: LocalDashboardStorage,
  maxMatchingKeys: number,
  maxPayloadCharacters: number,
  diagnostics: LocalDashboardScanDiagnostics,
  includeRecovery: boolean,
): LocalDashboardStoredEntry[] {
  const keys: string[] = [];
  let length = 0;
  try {
    length = storage.length;
  } catch {
    diagnostics.storageReadErrorCount += 1;
    return [];
  }
  for (let index = 0; index < length; index += 1) {
    let key: string | null = null;
    try {
      key = storage.key(index);
    } catch {
      diagnostics.storageReadErrorCount += 1;
    }
    if (key && isAllowedKey(key) && (includeRecovery || key !== RECOVERY_KEY)) keys.push(key);
  }
  keys.sort((left, right) => keyPriority(right) - keyPriority(left)
    || (left < right ? -1 : left > right ? 1 : 0));
  diagnostics.matchingKeyCount = keys.length;
  if (keys.length > maxMatchingKeys) diagnostics.matchingKeyLimitReached = true;

  const entries: LocalDashboardStoredEntry[] = [];
  for (const key of keys.slice(0, maxMatchingKeys)) {
    diagnostics.scannedKeyCount += 1;
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      diagnostics.storageReadErrorCount += 1;
      continue;
    }
    if (raw === null) continue;
    if (raw.length > maxPayloadCharacters) {
      diagnostics.oversizedCount += 1;
      continue;
    }
    const parsed = safeParse(raw);
    if (!parsed.ok) {
      diagnostics.malformedCount += 1;
      continue;
    }
    entries.push({ key, value: parsed.value });
  }
  return entries;
}

function parseRecoveryMetadata(value: unknown): LocalDashboardRecoveryMetadata[] {
  if (!Array.isArray(value)) return [];
  const metadata: LocalDashboardRecoveryMetadata[] = [];
  for (const item of value) {
    if (!isRecord(item) || item.storageVersion !== 1 || !isRecord(item.request)) continue;
    const ownerKey = typeof item.ownerId === 'string' && item.ownerId ? item.ownerId : null;
    const clientSubmissionId = typeof item.request.clientSubmissionId === 'string'
      && item.request.clientSubmissionId ? item.request.clientSubmissionId : null;
    if (!ownerKey || !clientSubmissionId) continue;
    metadata.push({
      ownerKey,
      clientSubmissionId,
      serverSessionId: typeof item.request.serverSessionId === 'string' ? item.request.serverSessionId : null,
      localSessionId: typeof item.request.localSessionId === 'string' ? item.request.localSessionId : null,
      pending: typeof item.syncStatus === 'string' && !TERMINAL_RECOVERY_STATES.has(item.syncStatus),
      localResult: item.localResult ?? null,
    });
  }
  return metadata;
}

function pushAdapted(
  result: LocalDashboardAdapterResult,
  attempts: LocalDashboardAttemptV1[],
  diagnostics: LocalDashboardScanDiagnostics,
): void {
  if (result.status === 'success') {
    diagnostics.supportedRecordCount += 1;
    attempts.push(result.attempt);
  } else if (result.status === 'malformed') {
    diagnostics.malformedCount += 1;
  } else {
    diagnostics.unsupportedCount += 1;
  }
}

function sameOwner(left: LocalDashboardAttemptV1, right: LocalDashboardAttemptV1): boolean {
  if (left.ownerScope !== right.ownerScope) return false;
  if (left.ownerScope === 'authenticated-owner') return left.ownerKey === right.ownerKey;
  return true;
}

function strongIdentity(left: LocalDashboardAttemptV1, right: LocalDashboardAttemptV1): boolean {
  return Boolean(
    (left.serverSessionId && right.serverSessionId && left.serverSessionId === right.serverSessionId)
    || (left.clientSubmissionId && right.clientSubmissionId && left.clientSubmissionId === right.clientSubmissionId)
  );
}

function isDuplicate(left: LocalDashboardAttemptV1, right: LocalDashboardAttemptV1): boolean {
  if (strongIdentity(left, right)) return sameOwner(left, right);
  if (!sameOwner(left, right)) return false;
  if (left.sessionId && right.sessionId && left.sessionId === right.sessionId) return true;
  if (left.localSessionId && right.localSessionId && left.localSessionId === right.localSessionId) return true;
  return left.stableId === right.stableId;
}

function detailRank(attempt: LocalDashboardAttemptV1): number {
  if (attempt.detailStatus === 'full') return 3;
  if (attempt.detailStatus === 'question-type-only') return 2;
  return 1;
}

function preferred(left: LocalDashboardAttemptV1, right: LocalDashboardAttemptV1): LocalDashboardAttemptV1 {
  const leftRank = detailRank(left);
  const rightRank = detailRank(right);
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;
  if (left.sourcePriority !== right.sourcePriority) return left.sourcePriority > right.sourcePriority ? left : right;
  return left.stableId.localeCompare(right.stableId) <= 0 ? left : right;
}

function mergeDuplicate(left: LocalDashboardAttemptV1, right: LocalDashboardAttemptV1): LocalDashboardAttemptV1 {
  const primary = preferred(left, right);
  const secondary = primary === left ? right : left;
  return {
    ...primary,
    sessionId: primary.sessionId ?? secondary.sessionId,
    localSessionId: primary.localSessionId ?? secondary.localSessionId,
    serverSessionId: primary.serverSessionId ?? secondary.serverSessionId,
    clientSubmissionId: primary.clientSubmissionId ?? secondary.clientSubmissionId,
    ownerScope: primary.ownerScope,
    ownerKey: primary.ownerKey,
    datasetVersion: primary.datasetVersion ?? secondary.datasetVersion,
    examContentHash: primary.examContentHash ?? secondary.examContentHash,
    pendingRecovery: primary.pendingRecovery || secondary.pendingRecovery,
  };
}

function annotateRecovery(
  attempt: LocalDashboardAttemptV1,
  metadata: LocalDashboardRecoveryMetadata[],
): LocalDashboardAttemptV1 {
  const matches = metadata.filter((item) => (
    (item.serverSessionId && (
      item.serverSessionId === attempt.serverSessionId || item.serverSessionId === attempt.sessionId
    ))
    || (item.localSessionId && (
      item.localSessionId === attempt.localSessionId || item.localSessionId === attempt.sessionId
    ))
    || (attempt.clientSubmissionId && item.clientSubmissionId === attempt.clientSubmissionId)
  ));
  if (matches.length === 0) return { ...attempt };
  const owners = new Set(matches.map((item) => item.ownerKey));
  if (owners.size > 1 || (
    attempt.ownerScope === 'authenticated-owner'
    && attempt.ownerKey !== matches[0].ownerKey
  )) {
    return { ...attempt, ownerScope: 'conflicting', ownerKey: null };
  }
  return {
    ...attempt,
    ownerScope: 'authenticated-owner',
    ownerKey: matches[0].ownerKey,
    serverSessionId: attempt.serverSessionId ?? matches.find((item) => item.serverSessionId)?.serverSessionId ?? null,
    localSessionId: attempt.localSessionId ?? matches.find((item) => item.localSessionId)?.localSessionId ?? null,
    clientSubmissionId: attempt.clientSubmissionId ?? matches[0].clientSubmissionId,
    pendingRecovery: attempt.pendingRecovery || matches.some((item) => item.pending),
  };
}

function dedupeAttempts(
  input: LocalDashboardAttemptV1[],
  diagnostics: LocalDashboardScanDiagnostics,
): LocalDashboardAttemptV1[] {
  const sorted = input.map((attempt) => ({ ...attempt }))
    .sort((left, right) => (
      right.sourcePriority - left.sourcePriority
      || right.submittedAt - left.submittedAt
      || left.stableId.localeCompare(right.stableId)
    ));
  const output: LocalDashboardAttemptV1[] = [];
  const duplicateGroups = new Set<number>();
  for (const attempt of sorted) {
    if (attempt.ownerScope === 'conflicting') {
      diagnostics.ownerConflictCount += 1;
      continue;
    }
    const strongConflictIndex = output.findIndex((candidate) => (
      strongIdentity(candidate, attempt)
      && candidate.ownerScope === 'authenticated-owner'
      && attempt.ownerScope === 'authenticated-owner'
      && candidate.ownerKey !== attempt.ownerKey
    ));
    if (strongConflictIndex >= 0) {
      output.splice(strongConflictIndex, 1);
      diagnostics.ownerConflictCount += 2;
      continue;
    }
    const duplicateIndex = output.findIndex((candidate) => isDuplicate(candidate, attempt));
    if (duplicateIndex < 0) {
      output.push(attempt);
      continue;
    }
    output[duplicateIndex] = mergeDuplicate(output[duplicateIndex], attempt);
    diagnostics.deduplicatedRecordCount += 1;
    duplicateGroups.add(duplicateIndex);
  }
  diagnostics.duplicateGroupCount = duplicateGroups.size;
  return output.sort((left, right) => right.submittedAt - left.submittedAt || left.stableId.localeCompare(right.stableId));
}

function matchesOwnerFilter(attempt: LocalDashboardAttemptV1, filter: LocalDashboardOwnerFilter): boolean {
  if (filter.kind === 'all-for-diagnostics') return attempt.ownerScope !== 'conflicting';
  if (filter.kind === 'anonymous') return attempt.ownerScope === 'anonymous';
  return attempt.ownerScope === 'authenticated-owner' && attempt.ownerKey === filter.ownerKey;
}

function pendingCountForFilter(metadata: LocalDashboardRecoveryMetadata[], filter: LocalDashboardOwnerFilter): number {
  if (filter.kind === 'anonymous') return 0;
  return metadata.filter((item) => item.pending && (
    filter.kind === 'all-for-diagnostics' || item.ownerKey === filter.ownerKey
  )).length;
}

function emptyDiagnostics(): LocalDashboardScanDiagnostics {
  return {
    scannedKeyCount: 0,
    scannedRecordCount: 0,
    matchingKeyCount: 0,
    supportedRecordCount: 0,
    deduplicatedRecordCount: 0,
    duplicateGroupCount: 0,
    ownerConflictCount: 0,
    malformedCount: 0,
    unsupportedCount: 0,
    oversizedCount: 0,
    storageReadErrorCount: 0,
    matchingKeyLimitReached: false,
    normalizedAttemptLimitReached: false,
    futureTimestampDroppedCount: 0,
  };
}

function adaptEntries(
  entries: LocalDashboardStoredEntry[],
  recoveryMetadata: LocalDashboardRecoveryMetadata[],
  materializeRecoveryAttempts: boolean,
  diagnostics: LocalDashboardScanDiagnostics,
): LocalDashboardAttemptV1[] {
  const attempts: LocalDashboardAttemptV1[] = [];
  for (const entry of entries) {
    if (entry.key === RECOVERY_KEY) {
      if (!materializeRecoveryAttempts) continue;
      for (const [index, metadata] of recoveryMetadata.entries()) {
        if (metadata.localResult === null) continue;
        diagnostics.scannedRecordCount += 1;
        pushAdapted(
          adaptRecoveryLocalResult(metadata, `recovery:${index}:${metadata.clientSubmissionId}`),
          attempts,
          diagnostics,
        );
      }
      continue;
    }
    diagnostics.scannedRecordCount += 1;
    if (entry.key.startsWith('exam_api_result_')) {
      pushAdapted(adaptApiSnapshotV2LocalResult(entry.value, entry.key), attempts, diagnostics);
    } else if (entry.key.startsWith('v2_result_')) {
      const snapshot = adaptApiSnapshotV2LocalResult(entry.value, entry.key);
      pushAdapted(
        snapshot.status === 'unsupported'
          ? adaptV2LegacyLocalResult(entry.value, entry.key)
          : snapshot,
        attempts,
        diagnostics,
      );
    }
  }
  return attempts;
}

function resolveOwners(
  attempts: LocalDashboardAttemptV1[],
  recoveryMetadata: LocalDashboardRecoveryMetadata[],
  diagnostics: LocalDashboardScanDiagnostics,
): LocalDashboardAttemptV1[] {
  const annotated = attempts.map((attempt) => annotateRecovery(attempt, recoveryMetadata));
  return dedupeAttempts(annotated, diagnostics);
}

function buildBreakdowns(
  deduped: LocalDashboardAttemptV1[],
  filtered: LocalDashboardAttemptV1[],
  ownerConflictCount: number,
) {
  const ownerScopeBreakdown: Record<LocalDashboardOwnerScope, number> = {
    anonymous: 0,
    'authenticated-owner': 0,
    'device-legacy-unscoped': 0,
    unknown: 0,
    conflicting: 0,
  };
  const excludedOwnerScopeBreakdown: Record<LocalDashboardOwnerScope, number> = {
    anonymous: 0,
    'authenticated-owner': 0,
    'device-legacy-unscoped': 0,
    unknown: 0,
    conflicting: ownerConflictCount,
  };
  const sourceBreakdown: Partial<Record<LocalDashboardSourceKind, number>> = {};
  const filteredAttempts = new Set(filtered);
  for (const attempt of deduped) {
    if (!filteredAttempts.has(attempt)) excludedOwnerScopeBreakdown[attempt.ownerScope] += 1;
  }
  for (const attempt of filtered) {
    ownerScopeBreakdown[attempt.ownerScope] += 1;
    sourceBreakdown[attempt.sourceKind] = (sourceBreakdown[attempt.sourceKind] ?? 0) + 1;
  }
  return { ownerScopeBreakdown, excludedOwnerScopeBreakdown, sourceBreakdown };
}

export function scanLocalDashboardAttempts(
  storage: LocalDashboardStorage,
  options: LocalDashboardScanOptions,
): LocalDashboardScanResult {
  const maxMatchingKeys = Math.max(1, Math.min(
    options.maxMatchingKeys ?? LOCAL_DASHBOARD_MAX_MATCHING_KEYS,
    LOCAL_DASHBOARD_MAX_MATCHING_KEYS,
  ));
  const maxNormalizedAttempts = Math.max(1, Math.min(
    options.maxNormalizedAttempts ?? LOCAL_DASHBOARD_MAX_NORMALIZED_ATTEMPTS,
    LOCAL_DASHBOARD_MAX_NORMALIZED_ATTEMPTS,
  ));
  const maxPayloadCharacters = Math.max(1, Math.min(
    options.maxPayloadCharacters ?? LOCAL_DASHBOARD_MAX_PAYLOAD_CHARACTERS,
    LOCAL_DASHBOARD_MAX_PAYLOAD_CHARACTERS,
  ));
  const diagnostics = emptyDiagnostics();
  const entries = readEntries(
    storage,
    maxMatchingKeys,
    maxPayloadCharacters,
    diagnostics,
    true,
  );
  const recoveryMetadata = entries
    .filter((entry) => entry.key === RECOVERY_KEY)
    .flatMap((entry) => parseRecoveryMetadata(entry.value));
  const attempts = adaptEntries(
    entries,
    recoveryMetadata,
    options.ownerFilter.kind !== 'anonymous',
    diagnostics,
  );
  const deduped = resolveOwners(attempts, recoveryMetadata, diagnostics);
  const ownerMatched = deduped.filter((attempt) => matchesOwnerFilter(attempt, options.ownerFilter));
  // Phản ánh dữ liệu của chính owner đang xem, không phải tổng mọi owner trên thiết bị.
  if (ownerMatched.length > maxNormalizedAttempts) diagnostics.normalizedAttemptLimitReached = true;
  const filtered = ownerMatched.slice(0, maxNormalizedAttempts);
  const breakdowns = buildBreakdowns(deduped, filtered, diagnostics.ownerConflictCount);
  return {
    attempts: filtered,
    diagnostics: { ...diagnostics },
    pendingRecoveryCount: pendingCountForFilter(recoveryMetadata, options.ownerFilter),
    ...breakdowns,
  };
}
