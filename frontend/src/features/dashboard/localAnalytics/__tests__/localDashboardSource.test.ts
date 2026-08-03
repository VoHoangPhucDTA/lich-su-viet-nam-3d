import { describe, expect, it } from 'vitest';
import { DashboardAnalyticsApiError } from '@/services/dashboardAnalyticsApi';
import {
  isLocalFallbackEligible,
  isRelevantLocalDashboardStorageEvent,
  loadLocalDashboard,
} from '../localDashboardSource';
import type { LocalDashboardStorage } from '../localDashboardRepository';
import {
  apiSnapshotFixture,
  recoveryQueueItemFixture,
  v2DetailedFixture,
  v2SummaryFixture,
} from './fixtures/localDashboardSyntheticFixtures';

class FakeStorage implements LocalDashboardStorage {
  private readonly values = new Map<string, string>();
  readonly reads: string[] = [];

  constructor(entries: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(entries)) {
      this.values.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }

  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }
}

const NOW = new Date('2026-07-24T05:00:00.000Z');

describe('dashboard local fallback eligibility', () => {
  it.each([
    ['transport', 0],
    ['timeout', 0],
    ['server', 502],
    ['server', 503],
    ['server', 504],
  ] as const)('allows only unavailable backend error %s/%s', (kind, status) => {
    expect(isLocalFallbackEligible(new DashboardAnalyticsApiError(kind, 'safe', status))).toBe(true);
  });

  it.each([
    ['invalid-request', 400],
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['unknown', 404],
    ['unknown', 409],
    ['unknown', 429],
    ['server', 500],
    ['contract', 0],
    ['aborted', 0],
    ['unknown', 0],
  ] as const)('rejects non-fallback error %s/%s', (kind, status) => {
    expect(isLocalFallbackEligible(new DashboardAnalyticsApiError(kind, 'safe', status))).toBe(false);
  });

  it('rejects raw and message-only errors', () => {
    expect(isLocalFallbackEligible(new TypeError('network'))).toBe(false);
    expect(isLocalFallbackEligible(new Error('503 timeout'))).toBe(false);
  });
});

describe('dashboard local storage-event allowlist', () => {
  it.each([
    ['exam_api_result_session', true],
    ['v2_result_session', true],
    ['custom_exam_session_session', false],
    ['exam_result_exam', false],
    ['exam_history', false],
    ['exam_submission_recovery_queue_v1', true],
    [null, true],
    ['exam_session_token_secret', false],
    ['auth_user', false],
    ['refresh_token', false],
    ['exam_api_session_draft_session', false],
    ['exam_api_session_locator_session', false],
    ['unrelated', false],
  ] as const)('classifies %s as %s without reading event value', (key, expected) => {
    expect(isRelevantLocalDashboardStorageEvent({ key, storageArea: null })).toBe(expected);
  });

  it('rejects sessionStorage events even when the key is allowlisted', () => {
    expect(isRelevantLocalDashboardStorageEvent({
      key: 'v2_result_session',
      storageArea: window.sessionStorage,
    })).toBe(false);
  });
});

describe('local dashboard source resolution', () => {
  it('uses only explicit anonymous attempts while safely reading recovery metadata', () => {
    const storage = new FakeStorage({
      'v2_result_anonymous': v2DetailedFixture({
        sessionId: 'anonymous-result',
        ownerScope: 'anonymous',
      }),
      'v2_result_owner': v2SummaryFixture({ sessionId: 'owner-result', userId: 'owner-a' }),
      'v2_result_device': v2SummaryFixture({ sessionId: 'device-result' }),
      'v2_result_unknown': v2SummaryFixture({ sessionId: 'unknown-result', ownerScope: 'unknown' }),
      exam_submission_recovery_queue_v1: [recoveryQueueItemFixture()],
    });
    const result = loadLocalDashboard({
      storage,
      ownerFilter: { kind: 'anonymous' },
      range: '30d',
      source: 'local',
      now: NOW,
    });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.viewModel.summary.totalAttempts).toBe(1);
    expect(result.viewModel.recentAttempts.map((attempt) => attempt.attemptId)).toEqual(['anonymous-result']);
    expect(result.viewModel.notices.map((notice) => notice.id)).toContain('device-unscoped-excluded');
    expect(storage.reads).toContain('exam_submission_recovery_queue_v1');
  });

  it('returns no-data instead of zero KPI when no explicit anonymous result exists', () => {
    const result = loadLocalDashboard({
      storage: new FakeStorage({
        'v2_result_device': v2SummaryFixture({ sessionId: 'device-result' }),
      }),
      ownerFilter: { kind: 'anonymous' },
      range: '30d',
      source: 'local',
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: 'no-data',
      storageUnavailable: false,
      excludedDeviceLegacyCount: 1,
    });
  });

  it('uses only the exact authenticated owner for local fallback', () => {
    const result = loadLocalDashboard({
      storage: new FakeStorage({
        'v2_result_owner-a': v2DetailedFixture({ sessionId: 'owner-a-result', userId: 'owner-a' }),
        'v2_result_owner-b': v2DetailedFixture({ sessionId: 'owner-b-result', userId: 'owner-b' }),
        'v2_result_anonymous': v2SummaryFixture({ sessionId: 'anonymous-result', ownerScope: 'anonymous' }),
        'v2_result_device': v2SummaryFixture({ sessionId: 'device-result' }),
      }),
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'owner-a' },
      range: '30d',
      source: 'local-fallback',
      now: NOW,
    });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.viewModel.scope).toMatchObject({ source: 'local-fallback', isAuthenticated: true });
    expect(result.viewModel.summary.totalAttempts).toBe(1);
    expect(result.viewModel.recentAttempts[0]?.attemptId).toBe('owner-a-result');
    expect(result.viewModel.notices.map((notice) => notice.id)).toContain('backend-unavailable-local-fallback');
  });

  it('marks unavailable storage without fabricating a local dashboard', () => {
    expect(loadLocalDashboard({
      storage: null,
      ownerFilter: { kind: 'anonymous' },
      range: '30d',
      source: 'local',
      now: NOW,
    })).toEqual({
      kind: 'no-data',
      storageUnavailable: true,
      excludedDeviceLegacyCount: 0,
    });
  });

  it('only creates safe result routes for API/v2 result sources', () => {
    const api = apiSnapshotFixture({ ownerScope: 'anonymous' });
    const summary = v2SummaryFixture({ sessionId: 'v2-safe', ownerScope: 'anonymous' });
    const result = loadLocalDashboard({
      storage: new FakeStorage({
        'exam_api_result_api-session-1': api,
        'v2_result_v2-safe': summary,
      }),
      ownerFilter: { kind: 'anonymous' },
      range: 'all',
      source: 'local',
      now: NOW,
    });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.viewModel.recentAttempts.every((attempt) => attempt.resultRoute !== null)).toBe(true);
  });

  it('ignores custom session payloads without degrading local coverage', () => {
    const result = loadLocalDashboard({
      storage: new FakeStorage({
        'custom_exam_session_large-draft': {
          sessionId: 'large-draft',
          mode: 'custom_mock',
          status: 'submitted',
          questionSnapshots: [{ id: 'q1', questionType: 'mcq' }],
        },
        'exam_api_result_api-session-1': apiSnapshotFixture({ ownerScope: 'anonymous' }),
      }),
      ownerFilter: { kind: 'anonymous' },
      range: 'all',
      source: 'local',
      now: NOW,
    });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.viewModel.coverage.isComplete).toBe(true);
    expect(result.viewModel.notices.map(notice => notice.id)).not.toContain('local-coverage-partial');
  });

  it('ignores retired legacy history keys instead of exposing stale attempts', () => {
    const result = loadLocalDashboard({
      storage: new FakeStorage({
        'exam_result_old-exam-1': { sessionId: 'old-exam-1', userId: 'owner-a' },
      }),
      ownerFilter: { kind: 'authenticated-owner', ownerKey: 'owner-a' },
      range: 'all',
      source: 'local-fallback',
      now: NOW,
    });
    expect(result).toMatchObject({ kind: 'no-data', storageUnavailable: false });
  });
});
