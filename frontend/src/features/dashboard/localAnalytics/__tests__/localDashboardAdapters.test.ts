import { describe, expect, it } from 'vitest';
import {
  adaptApiSnapshotV2LocalResult,
  adaptRecoveryLocalResult,
  adaptV2LegacyLocalResult,
  parseLocalDashboardTimestamp,
} from '../localDashboardAdapters';
import {
  apiSnapshotFixture,
  customLocalResultFixture,
  recoveryQueueItemFixture,
  v2DetailedFixture,
  v2SummaryFixture,
} from './fixtures/localDashboardSyntheticFixtures';

function successAttempt(result: ReturnType<typeof adaptV2LegacyLocalResult>) {
  if (result.status !== 'success') throw new Error(`Expected success, received ${result.status}:${result.reason}`);
  return result.attempt;
}

describe('local dashboard source adapters', () => {
  it('adapts a cached API snapshot v2 and discards raw answers/answer keys', () => {
    const result = adaptApiSnapshotV2LocalResult(apiSnapshotFixture(), 'exam_api_result_api-session-1');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.attempt).toMatchObject({
      sourceKind: 'api-snapshot-v2-cache', mode: 'TIMED_ORIGINAL', detailStatus: 'full', totalScore: 7.5,
    });
    expect(result.attempt.normalizedQuestions?.[1]).toMatchObject({
      correctUnits: 1, answeredUnits: 2, blankUnits: 2, totalUnits: 4, completionState: 'PARTIAL',
    });
    const safeOutput = JSON.stringify(result.attempt.normalizedQuestions);
    expect(safeOutput).not.toContain('correctAnswer');
    expect(safeOutput).not.toContain('userAnswer');
    expect(safeOutput).not.toContain('selected');
  });

  it('scores mcq from the answer key, not the correctness flag', () => {
    const snapshot = apiSnapshotFixture();
    const snapshotAttempt = successAttempt(adaptApiSnapshotV2LocalResult({
      ...snapshot,
      questions: [
        {
          ...snapshot.questions[0]!,
          userAnswer: 'A',
          correctAnswer: 'B',
          correctness: true,
        },
        snapshot.questions[1]!,
      ],
    }, 'snapshot-mismatched-correctness'));
    expect(snapshotAttempt.normalizedQuestions?.[0]?.correctUnits).toBe(0);

    const legacy = v2DetailedFixture();
    const legacyAttempt = successAttempt(adaptV2LegacyLocalResult({
      ...legacy,
      questions: [
        {
          ...legacy.questions[0]!,
          isCorrect: true,
          mcq: { selected: 'A', correct: 'B' },
        },
        legacy.questions[1]!,
      ],
    }, 'legacy-mismatched-correctness'));
    expect(legacyAttempt.normalizedQuestions?.[0]?.correctUnits).toBe(0);
  });

  it('scores mcq correctly when the correctness flag is missing entirely', () => {
    const snapshot = apiSnapshotFixture();
    const snapshotMcqWithoutFlag: Record<string, unknown> = { ...snapshot.questions[0]! };
    delete snapshotMcqWithoutFlag.correctness;
    const snapshotAttempt = successAttempt(adaptApiSnapshotV2LocalResult({
      ...snapshot,
      questions: [
        { ...snapshotMcqWithoutFlag, userAnswer: 'A', correctAnswer: 'A' },
        snapshot.questions[1]!,
      ],
    }, 'snapshot-missing-correctness'));
    expect(snapshotAttempt.normalizedQuestions?.[0]?.correctUnits).toBe(1);

    const legacy = v2DetailedFixture();
    const legacyMcqWithoutFlag: Record<string, unknown> = { ...legacy.questions[0]! };
    delete legacyMcqWithoutFlag.isCorrect;
    const legacyAttempt = successAttempt(adaptV2LegacyLocalResult({
      ...legacy,
      questions: [
        { ...legacyMcqWithoutFlag, mcq: { selected: 'A', correct: 'A' } },
        legacy.questions[1]!,
      ],
    }, 'legacy-missing-correctness'));
    expect(legacyAttempt.normalizedQuestions?.[0]?.correctUnits).toBe(1);
  });

  it('rejects snapshot version mismatch as unsupported', () => {
    expect(adaptApiSnapshotV2LocalResult(apiSnapshotFixture({ snapshotSchemaVersion: 3 }), 'key'))
      .toEqual({ status: 'unsupported', reason: 'snapshot-version-mismatch' });
  });

  it.each([
    ['missing score', () => apiSnapshotFixture({ summary: { ...apiSnapshotFixture().summary, totalScore: undefined } }), 'missing-score'],
    ['invalid score', () => apiSnapshotFixture({ summary: { ...apiSnapshotFixture().summary, totalScore: 11 } }), 'invalid-score'],
    ['invalid mode', () => apiSnapshotFixture({ mode: 'FREE_PRACTICE' }), 'unsupported-mode'],
    ['missing timestamp', () => apiSnapshotFixture({ submittedAtServer: undefined }), 'missing-timestamp'],
  ] as const)('classifies %s without throwing', (_name, makeValue, reason) => {
    expect(adaptApiSnapshotV2LocalResult(makeValue(), 'key')).toMatchObject({ reason });
  });

  it('rejects negative duration from legacy summary', () => {
    expect(adaptV2LegacyLocalResult(v2SummaryFixture({ durationSeconds: -1 }), 'key'))
      .toEqual({ status: 'malformed', reason: 'invalid-duration' });
  });

  it('rejects a T/F statement map mismatch', () => {
    const value = v2DetailedFixture();
    const questions = structuredClone(value.questions);
    questions[1]!.tf!.correct = { a: true, b: true, c: false } as never;
    expect(adaptV2LegacyLocalResult({ ...value, questions }, 'key'))
      .toEqual({ status: 'malformed', reason: 'invalid-question-detail' });
  });

  it('keeps summary-only legacy results eligible without fabricating detail', () => {
    const attempt = successAttempt(adaptV2LegacyLocalResult(v2SummaryFixture(), 'v2_result_legacy-summary-1'));
    expect(attempt).toMatchObject({ detailStatus: 'summary-only', normalizedQuestions: null });
  });

  it('keeps question-type analytics when topic and cognitive metadata are absent', () => {
    const attempt = successAttempt(adaptV2LegacyLocalResult({
      ...v2DetailedFixture(),
      questionSnapshots: [
        { id: 'legacy-mcq', topic: 'Cách mạng tháng Tám', cognitiveLevel: 'knowledge' },
      ],
    }, 'v2_result_legacy-detail-1'));
    expect(attempt.detailStatus).toBe('question-type-only');
    expect(attempt.normalizedQuestions).toHaveLength(2);
    expect(attempt.normalizedQuestions?.every((question) => (
      question.topicRefs.length === 0 && question.cognitiveLevel === null
    ))).toBe(true);
  });

  it('adapts custom local result detail only from immutable embedded snapshots', () => {
    const attempt = successAttempt(adaptV2LegacyLocalResult(customLocalResultFixture(), 'v2_result_custom-local-1'));
    expect(attempt).toMatchObject({
      mode: 'CUSTOM_MOCK',
      detailStatus: 'question-type-only',
      scoreAuthority: 'LOCAL_FALLBACK',
    });
    expect(attempt.normalizedQuestions?.every(question => (
      question.topicRefs.length === 0 && question.cognitiveLevel === null
    ))).toBe(true);
  });

  it.each([
    [1785000000000, true],
    [1785000000, false],
    ['2026-07-20T23:30:00+07:00', true],
    ['2026-07-20T16:30:00Z', true],
    ['2026-07-20T23:30:00', false],
    ['2026-07-20', false],
  ])('parses strict timestamp %s', (value, accepted) => {
    expect(parseLocalDashboardTimestamp(value) !== null).toBe(accepted);
  });

  it('rejects reserved statement ids instead of touching Object.prototype', () => {
    const snapshot = apiSnapshotFixture();
    const tf = structuredClone(snapshot.questions[1]!);
    tf.question.statements = [{ id: '__proto__', text: 'unsafe' }] as never;
    tf.userAnswer = JSON.parse('{"__proto__":true}') as never;
    tf.correctAnswer = JSON.parse('{"__proto__":true}') as never;
    expect(adaptApiSnapshotV2LocalResult({
      ...snapshot,
      questions: [snapshot.questions[0]!, tf],
    }, 'reserved-key')).toMatchObject({ status: 'malformed', reason: 'invalid-question-detail' });
  });

  it('bounds duration and total question count', () => {
    expect(adaptV2LegacyLocalResult(v2SummaryFixture({ durationSeconds: 86_401 }), 'duration'))
      .toMatchObject({ status: 'malformed', reason: 'invalid-duration' });
    expect(adaptV2LegacyLocalResult(v2SummaryFixture({ totalQuestions: 201 }), 'questions'))
      .toMatchObject({ status: 'malformed', reason: 'invalid-total-questions' });
  });

  it('uses top-level valid summary fields when nested snapshot summary omits them', () => {
    const snapshot = apiSnapshotFixture({
      totalScore: 7.5,
      totalQuestions: 2,
      summary: { ...apiSnapshotFixture().summary, totalScore: undefined, totalQuestions: undefined },
    });
    expect(adaptApiSnapshotV2LocalResult(snapshot, 'fallback').status).toBe('success');
  });

  it('classifies explicit anonymous, authenticated, unscoped, unknown and conflicting ownership', () => {
    expect(successAttempt(adaptV2LegacyLocalResult(v2SummaryFixture({ ownerScope: 'anonymous' }), 'a')).ownerScope)
      .toBe('anonymous');
    expect(successAttempt(adaptV2LegacyLocalResult(v2SummaryFixture({ userId: 'owner-a' }), 'b')))
      .toMatchObject({ ownerScope: 'authenticated-owner', ownerKey: 'owner-a' });
    expect(successAttempt(adaptV2LegacyLocalResult(v2SummaryFixture({ userId: ' owner-a ' }), 'trimmed')))
      .toMatchObject({ ownerScope: 'authenticated-owner', ownerKey: 'owner-a' });
    expect(successAttempt(adaptV2LegacyLocalResult(v2SummaryFixture(), 'c')).ownerScope)
      .toBe('device-legacy-unscoped');
    expect(successAttempt(adaptV2LegacyLocalResult(v2SummaryFixture({ ownerScope: 'unknown' }), 'unknown')).ownerScope)
      .toBe('unknown');
    expect(successAttempt(adaptV2LegacyLocalResult(v2SummaryFixture({ userId: 'owner-a', ownerId: 'owner-b' }), 'd')).ownerScope)
      .toBe('conflicting');
  });

  it('recovery metadata assigns owner only through exact correlation and detects conflict', () => {
    const queue = recoveryQueueItemFixture({ localResult: v2DetailedFixture() });
    const metadata = {
      ownerKey: queue.ownerId,
      clientSubmissionId: queue.request.clientSubmissionId,
      serverSessionId: null,
      localSessionId: queue.request.localSessionId,
      pending: true,
      localResult: queue.localResult,
    };
    const result = adaptRecoveryLocalResult(metadata, 'recovery:1');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.attempt).toMatchObject({
      ownerScope: 'authenticated-owner', ownerKey: 'synthetic-owner-a', pendingRecovery: true,
    });

    const conflict = adaptRecoveryLocalResult({
      ...metadata,
      localResult: v2DetailedFixture({ userId: 'different-owner' }),
    }, 'recovery:2');
    expect(conflict.status === 'success' ? conflict.attempt.ownerScope : null).toBe('conflicting');
  });

  it('adapter failure output contains only a safe reason category', () => {
    const result = adaptV2LegacyLocalResult({ secretAnswer: 'SYNTHETIC_PRIVATE_ANSWER' }, 'key');
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_ANSWER');
  });
});
