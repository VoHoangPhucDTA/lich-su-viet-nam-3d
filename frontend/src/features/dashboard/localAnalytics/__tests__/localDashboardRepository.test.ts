import { describe, expect, it } from 'vitest';
import {
  LOCAL_DASHBOARD_MAX_PAYLOAD_CHARACTERS,
  scanLocalDashboardAttempts,
  type LocalDashboardStorage,
} from '../localDashboardRepository';
import {
  apiSnapshotFixture,
  customSessionFixture,
  oldExamResultFixture,
  recoveryQueueItemFixture,
  v2DetailedFixture,
  v2SummaryFixture,
} from './fixtures/localDashboardSyntheticFixtures';

class FakeStorage implements LocalDashboardStorage {
  private readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  throwOnGet = new Set<string>();

  constructor(entries: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(entries)) {
      this.values.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }

  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) {
    this.reads.push(key);
    if (this.throwOnGet.has(key)) throw new Error('Synthetic storage read error');
    return this.values.get(key) ?? null;
  }
}

const all = { ownerFilter: { kind: 'all-for-diagnostics' as const } };

describe('local dashboard allowlisted scanner', () => {
  it('reads only allowlisted result/history/recovery keys and never token/auth values', () => {
    const storage = new FakeStorage({
      'v2_result_a': v2SummaryFixture(),
      'exam_session_token_secret': 'SYNTHETIC_TOKEN_VALUE',
      auth_user: { id: 'must-not-read' },
      refresh_token: 'must-not-read',
      unrelated: { totalScore: 10 },
    });
    const result = scanLocalDashboardAttempts(storage, all);
    expect(result.attempts).toHaveLength(1);
    expect(storage.reads).toEqual(['v2_result_a']);
    expect(storage.reads.some((key) => key.includes('token') || key === 'auth_user')).toBe(false);
    expect(storage.writes).toEqual([]);
  });

  it('handles corrupt JSON, unknown schema and storage read exceptions without failing the scan', () => {
    const storage = new FakeStorage({
      'v2_result_corrupt': '{bad json',
      'v2_result_unknown': { schema: 'unknown' },
      'v2_result_valid': v2SummaryFixture({ sessionId: 'valid' }),
    });
    storage.throwOnGet.add('v2_result_valid');
    const result = scanLocalDashboardAttempts(storage, all);
    expect(result.attempts).toEqual([]);
    expect(result.diagnostics).toMatchObject({ malformedCount: 1, unsupportedCount: 1, storageReadErrorCount: 1 });
  });

  it('skips oversized payloads and reports the limit', () => {
    const storage = new FakeStorage({
      'v2_result_large': 'x'.repeat(LOCAL_DASHBOARD_MAX_PAYLOAD_CHARACTERS + 1),
    });
    const result = scanLocalDashboardAttempts(storage, all);
    expect(result.attempts).toEqual([]);
    expect(result.diagnostics.oversizedCount).toBe(1);
  });

  it('enforces matching-key and normalized-attempt limits', () => {
    const storage = new FakeStorage({
      'v2_result_1': v2SummaryFixture({ sessionId: 'one' }),
      'v2_result_2': v2SummaryFixture({ sessionId: 'two' }),
      'v2_result_3': v2SummaryFixture({ sessionId: 'three' }),
    });
    const keyLimited = scanLocalDashboardAttempts(storage, { ...all, maxMatchingKeys: 2 });
    expect(keyLimited.diagnostics.matchingKeyLimitReached).toBe(true);
    expect(storage.reads).toHaveLength(2);

    const attemptLimited = scanLocalDashboardAttempts(storage, { ...all, maxNormalizedAttempts: 1 });
    expect(attemptLimited.attempts).toHaveLength(1);
    expect(attemptLimited.diagnostics.normalizedAttemptLimitReached).toBe(true);
  });

  it('does not flag the normalized-attempt limit for an owner whose own data fits', () => {
    const ownerBEntries = Object.fromEntries(Array.from({ length: 520 }, (_, index) => [
      `v2_result_owner-b-${index}`,
      v2SummaryFixture({ sessionId: `owner-b-${index}`, userId: 'owner-b' }),
    ]));
    const storage = new FakeStorage({
      ...ownerBEntries,
      'v2_result_owner-a-1': v2SummaryFixture({ sessionId: 'owner-a-1', userId: 'owner-a' }),
      'v2_result_owner-a-2': v2SummaryFixture({ sessionId: 'owner-a-2', userId: 'owner-a' }),
      'v2_result_owner-a-3': v2SummaryFixture({ sessionId: 'owner-a-3', userId: 'owner-a' }),
    });
    const result = scanLocalDashboardAttempts(storage, {
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'owner-a' },
    });
    expect(result.attempts).toHaveLength(3);
    expect(result.diagnostics.normalizedAttemptLimitReached).toBe(false);
  });

  it('does not let caller options raise the hard scanner caps', () => {
    const storage = new FakeStorage({
      'v2_result_1': v2SummaryFixture({ sessionId: 'one' }),
    });
    const result = scanLocalDashboardAttempts(storage, {
      ...all,
      maxMatchingKeys: Number.MAX_SAFE_INTEGER,
      maxNormalizedAttempts: Number.MAX_SAFE_INTEGER,
      maxPayloadCharacters: Number.MAX_SAFE_INTEGER,
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts.length).toBeLessThanOrEqual(500);
  });

  it('returns deterministic output independent of storage insertion order', () => {
    const entriesA = {
      'v2_result_b': v2SummaryFixture({ sessionId: 'b', submittedAt: 100 }),
      'v2_result_a': v2SummaryFixture({ sessionId: 'a', submittedAt: 100 }),
    };
    const entriesB = Object.fromEntries(Object.entries(entriesA).reverse());
    const first = scanLocalDashboardAttempts(new FakeStorage(entriesA), all);
    const second = scanLocalDashboardAttempts(new FakeStorage(entriesB), all);
    expect(first.attempts.map((item) => item.stableId)).toEqual(second.attempts.map((item) => item.stableId));
  });

  it('classifies standalone custom session and old practice history as unsupported', () => {
    const storage = new FakeStorage({
      'custom_exam_session_custom-local-1': customSessionFixture(),
      exam_history: [oldExamResultFixture({ config: { mode: 'practice' } })],
    });
    const result = scanLocalDashboardAttempts(storage, all);
    expect(result.attempts).toEqual([]);
    expect(result.diagnostics.unsupportedCount).toBe(2);
  });
});

describe('local dashboard owner scope and conservative filters', () => {
  it('selects explicit anonymous, authenticated owner and device-unscoped records separately', () => {
    const storage = new FakeStorage({
      'v2_result_anonymous': v2SummaryFixture({ sessionId: 'anonymous', ownerScope: 'anonymous' }),
      'v2_result_owner-a': v2SummaryFixture({ sessionId: 'owner-a-result', userId: 'owner-a' }),
      'v2_result_device': v2SummaryFixture({ sessionId: 'device-result' }),
    });
    expect(scanLocalDashboardAttempts(storage, { ownerFilter: { kind: 'anonymous' } }).attempts.map((item) => item.sessionId))
      .toEqual(['anonymous']);
    expect(scanLocalDashboardAttempts(storage, { ownerFilter: { kind: 'authenticated-owner', ownerKey: 'owner-a' } }).attempts.map((item) => item.sessionId))
      .toEqual(['owner-a-result']);
    expect(scanLocalDashboardAttempts(storage, { ownerFilter: { kind: 'device-local' } }).attempts.map((item) => item.sessionId))
      .toEqual(['device-result']);
  });

  it('does not let current owner B claim owner A or unscoped data', () => {
    const storage = new FakeStorage({
      'v2_result_owner-a': v2SummaryFixture({ sessionId: 'owner-a-result', userId: 'owner-a' }),
      'v2_result_device': v2SummaryFixture({ sessionId: 'device-result' }),
    });
    const ownerB = scanLocalDashboardAttempts(storage, {
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'owner-b' },
    });
    expect(ownerB.attempts).toEqual([]);
  });

  it('keeps explicit unknown out of anonymous, owner, and device-local filters', () => {
    const storage = new FakeStorage({
      'v2_result_unknown-owner': v2SummaryFixture({ sessionId: 'unknown-owner', ownerScope: 'unknown' }),
    });
    expect(scanLocalDashboardAttempts(storage, all).attempts[0]?.ownerScope).toBe('unknown');
    expect(scanLocalDashboardAttempts(storage, { ownerFilter: { kind: 'anonymous' } }).attempts).toEqual([]);
    expect(scanLocalDashboardAttempts(storage, { ownerFilter: { kind: 'device-local' } }).attempts).toEqual([]);
    expect(scanLocalDashboardAttempts(storage, {
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'owner-a' },
    }).attempts).toEqual([]);
  });

  it('does not expose authenticated records through the anonymous filter', () => {
    const storage = new FakeStorage({
      'v2_result_owner-a': v2SummaryFixture({ sessionId: 'owner-a-result', userId: 'owner-a' }),
    });
    expect(scanLocalDashboardAttempts(storage, { ownerFilter: { kind: 'anonymous' } }).attempts).toEqual([]);
  });

  it('excludes conflicting owner metadata', () => {
    const storage = new FakeStorage({
      'v2_result_conflict': v2SummaryFixture({ userId: 'owner-a', ownerId: 'owner-b' }),
    });
    const result = scanLocalDashboardAttempts(storage, all);
    expect(result.attempts).toEqual([]);
    expect(result.diagnostics.ownerConflictCount).toBe(1);
  });

  it('does not infer ownership from title, timestamp or session prefix', () => {
    const storage = new FakeStorage({
      'v2_result_owner-b-looking': v2SummaryFixture({
        sessionId: 'owner-b', title: 'owner-b', submittedAt: Date.parse('2026-07-20T00:00:00Z'),
      }),
    });
    const result = scanLocalDashboardAttempts(storage, {
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'owner-b' },
    });
    expect(result.attempts).toEqual([]);
  });
});

describe('local dashboard deterministic dedupe and recovery annotation', () => {
  it('dedupes by serverSessionId and prefers immutable API snapshot over summary-only', () => {
    const storage = new FakeStorage({
      'exam_api_result_api-session-1': apiSnapshotFixture(),
      'v2_result_duplicate': v2SummaryFixture({
        sessionId: 'api-session-1', serverSessionId: 'api-session-1', totalScore: 1,
      }),
    });
    const result = scanLocalDashboardAttempts(storage, all);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ sourceKind: 'api-snapshot-v2-cache', totalScore: 7.5, detailStatus: 'full' });
    expect(result.diagnostics).toMatchObject({ deduplicatedRecordCount: 1, duplicateGroupCount: 1 });
  });

  it('dedupes same clientSubmissionId and richer immutable local detail wins', () => {
    const storage = new FakeStorage({
      'v2_result_summary': v2SummaryFixture({ sessionId: 'summary', clientSubmissionId: 'same-client' }),
      'v2_result_detail': v2DetailedFixture({ sessionId: 'detail', clientSubmissionId: 'same-client' }),
    });
    const result = scanLocalDashboardAttempts(storage, all);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].detailStatus).toBe('question-type-only');
  });

  it('dedupes same session/localSession only for the same owner', () => {
    const sameOwner = new FakeStorage({
      'v2_result_a': v2SummaryFixture({ sessionId: 'same', userId: 'owner-a' }),
      'v2_result_b': v2DetailedFixture({ sessionId: 'same', userId: 'owner-a' }),
    });
    expect(scanLocalDashboardAttempts(sameOwner, all).attempts).toHaveLength(1);

    const differentOwner = new FakeStorage({
      'v2_result_a': v2SummaryFixture({ sessionId: 'same', userId: 'owner-a' }),
      'v2_result_b': v2DetailedFixture({ sessionId: 'same', userId: 'owner-b' }),
    });
    expect(scanLocalDashboardAttempts(differentOwner, all).attempts).toHaveLength(2);
  });

  it('dedupes exact localSessionId for the same recovery owner', () => {
    const first = recoveryQueueItemFixture({
      request: {
        clientSubmissionId: 'client-a', localSessionId: 'shared-local-session', mode: 'TIMED_ORIGINAL',
        datasetVersion: 'synthetic-dataset-v1', clientTiming: {}, questionRefs: [], answers: [],
      },
      localResult: v2SummaryFixture({ sessionId: 'result-a' }),
    });
    const second = recoveryQueueItemFixture({
      request: {
        clientSubmissionId: 'client-b', localSessionId: 'shared-local-session', mode: 'TIMED_ORIGINAL',
        datasetVersion: 'synthetic-dataset-v1', clientTiming: {}, questionRefs: [], answers: [],
      },
      localResult: v2DetailedFixture({ sessionId: 'result-b' }),
    });
    const result = scanLocalDashboardAttempts(new FakeStorage({
      exam_submission_recovery_queue_v1: [first, second],
    }), all);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ detailStatus: 'question-type-only', localSessionId: 'shared-local-session' });
  });

  it('does not dedupe same score/title/time without identity', () => {
    const storage = new FakeStorage({
      'v2_result_a': v2SummaryFixture({ sessionId: 'identity-a' }),
      'v2_result_b': v2SummaryFixture({ sessionId: 'identity-b' }),
    });
    expect(scanLocalDashboardAttempts(storage, all).attempts).toHaveLength(2);
  });

  it('recovery queue annotates owner/pending and never becomes a second attempt', () => {
    const localResult = v2DetailedFixture();
    const storage = new FakeStorage({
      'v2_result_legacy-detail-1': localResult,
      exam_submission_recovery_queue_v1: [recoveryQueueItemFixture({ localResult })],
    });
    const result = scanLocalDashboardAttempts(storage, {
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'synthetic-owner-a' },
    });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ ownerKey: 'synthetic-owner-a', pendingRecovery: true });
    expect(result.pendingRecoveryCount).toBe(1);
    expect(result.diagnostics.deduplicatedRecordCount).toBe(1);
  });

  it('does not count terminal recovery as pending', () => {
    const storage = new FakeStorage({
      'v2_result_legacy-detail-1': v2DetailedFixture(),
      exam_submission_recovery_queue_v1: [recoveryQueueItemFixture({ syncStatus: 'FAILED_PERMANENT' })],
    });
    const result = scanLocalDashboardAttempts(storage, {
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'synthetic-owner-a' },
    });
    expect(result.pendingRecoveryCount).toBe(0);
  });

  it('does not mutate source records', () => {
    const value = v2DetailedFixture({ userId: 'owner-a' });
    const before = structuredClone(value);
    scanLocalDashboardAttempts(new FakeStorage({ 'v2_result_a': value }), all);
    expect(value).toEqual(before);
  });
});
