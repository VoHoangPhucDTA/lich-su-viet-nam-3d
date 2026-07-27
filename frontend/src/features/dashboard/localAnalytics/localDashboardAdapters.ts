import type {
  LocalDashboardAdapterResult,
  LocalDashboardCognitiveLevel,
  LocalDashboardCompletionState,
  LocalDashboardMode,
  LocalDashboardOwnerScope,
  LocalDashboardQuestionEvidence,
  LocalDashboardRecoveryMetadata,
  LocalDashboardScoreAuthority,
  LocalDashboardSubmissionOrigin,
  LocalDashboardTimingAuthority,
  LocalDashboardTopicRef,
} from './localDashboardTypes';
import { LOCAL_SOURCE_PRIORITY } from './localDashboardTypes';
import { isRecord } from './localDashboardGuards';

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

const MIN_EPOCH_MS = Date.UTC(2000, 0, 1);
const MAX_EPOCH_MS = Date.UTC(2100, 0, 1);
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_TOTAL_QUESTIONS = 200;
const RESERVED_STATEMENT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Chỉ nhận epoch mili-giây hợp lý hoặc ISO-8601 có offset tường minh. */
export function parseLocalDashboardTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value >= MIN_EPOCH_MS && value <= MAX_EPOCH_MS ? value : null;
  }
  if (typeof value === 'string' && ISO_WITH_OFFSET.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapMode(value: unknown): LocalDashboardMode | null {
  if (value === 'TIMED_ORIGINAL' || value === 'thi_thu' || value === 'thpt_mock') return 'TIMED_ORIGINAL';
  if (value === 'CUSTOM_MOCK' || value === 'custom_mock' || value === 'custom') return 'CUSTOM_MOCK';
  return null;
}

function scoreAuthority(value: unknown): LocalDashboardScoreAuthority {
  if (value === 'BACKEND' || value === 'LOCAL_FALLBACK' || value === 'FRONTEND_LEGACY') return value;
  return 'FRONTEND_LEGACY';
}

function timingAuthority(value: unknown): LocalDashboardTimingAuthority {
  if (value === 'SERVER' || value === 'CLIENT_UNVERIFIED' || value === 'LOCAL') return value;
  return 'LOCAL';
}

function submissionOrigin(value: unknown): LocalDashboardSubmissionOrigin {
  if (
    value === 'SERVER_ON_TIME'
    || value === 'SERVER_ISSUED_LATE'
    || value === 'CLIENT_FALLBACK'
    || value === 'LOCAL_FALLBACK'
  ) return value;
  return 'LOCAL_FALLBACK';
}

function classifyOwner(value: Record<string, unknown>): { scope: LocalDashboardOwnerScope; key: string | null } {
  const userId = nonEmptyString(value.userId);
  const ownerId = nonEmptyString(value.ownerId);
  if (userId && ownerId && userId !== ownerId) return { scope: 'conflicting', key: null };
  const ownerKey = ownerId ?? userId;
  if (ownerKey) return { scope: 'authenticated-owner', key: ownerKey };
  if (value.ownerScope === 'anonymous' || value.isAnonymous === true) return { scope: 'anonymous', key: null };
  if (value.ownerScope === 'unknown') return { scope: 'unknown', key: null };
  return { scope: 'device-legacy-unscoped', key: null };
}

function parseCognitiveLevel(value: unknown): LocalDashboardCognitiveLevel | null {
  return value === 'knowledge' || value === 'comprehension' || value === 'application' ? value : null;
}

function parseCompletion(value: unknown): LocalDashboardCompletionState | null {
  return value === 'BLANK' || value === 'PARTIAL' || value === 'COMPLETE' ? value : null;
}

function parseTopicRefs(value: unknown): LocalDashboardTopicRef[] | null {
  if (!Array.isArray(value)) return [];
  const refs: LocalDashboardTopicRef[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const key = nonEmptyString(item.slug);
    const label = nonEmptyString(item.title);
    if (!key || !label) return null;
    refs.push({
      key,
      label,
      periodKey: nonEmptyString(item.periodSlug),
      periodLabel: nonEmptyString(item.periodTitle),
    });
  }
  return refs;
}

function parseStatementMap(
  value: unknown,
  statementIds: string[],
  allowNull: boolean,
): Record<string, boolean | null> | null {
  if (!isRecord(value)) return null;
  const valueIds = Object.keys(value);
  if (valueIds.length !== statementIds.length || valueIds.some((id) => !statementIds.includes(id))) return null;
  const result: Record<string, boolean | null> = Object.create(null);
  for (const id of statementIds) {
    if (RESERVED_STATEMENT_KEYS.has(id)) return null;
    const selected = value[id];
    if (typeof selected !== 'boolean' && !(allowNull && selected === null)) return null;
    result[id] = selected;
  }
  return result;
}

function snapshotQuestionEvidence(value: unknown): LocalDashboardQuestionEvidence | null {
  if (!isRecord(value) || !isRecord(value.question)) return null;
  const questionId = nonEmptyString(value.questionInstanceId) ?? nonEmptyString(value.publicQuestionId);
  const questionType = value.question.questionType;
  const completionState = parseCompletion(value.completionState);
  const topicRefs = parseTopicRefs(value.topicRefs);
  if (!questionId || !completionState || !topicRefs) return null;

  if (questionType === 'mcq') {
    const userAnswer = value.userAnswer;
    if (!(userAnswer === null || typeof userAnswer === 'string') || typeof value.correctAnswer !== 'string') return null;
    const blank = userAnswer === null;
    // Chấm từ đáp án, giống DashboardSnapshotV2Parser.parseMcq(). Cờ `correctness`
    // chỉ dùng để đối chiếu — không bao giờ là nguồn chân lý. Local không reject khi
    // cờ lệch vì localStorage còn dữ liệu từ nhiều phiên bản writer cũ.
    const derivedCorrect = !blank && userAnswer === value.correctAnswer;
    return {
      questionId,
      questionType,
      completionState: blank ? 'BLANK' : 'COMPLETE',
      correctUnits: derivedCorrect ? 1 : 0,
      answeredUnits: blank ? 0 : 1,
      blankUnits: blank ? 1 : 0,
      totalUnits: 1,
      topicRefs,
      cognitiveLevel: parseCognitiveLevel(value.question.cognitiveLevel),
    };
  }

  if (questionType === 'true_false') {
    if (!Array.isArray(value.question.statements) || value.question.statements.length === 0) return null;
    const statementIds: string[] = [];
    for (const statement of value.question.statements) {
      if (!isRecord(statement) || !nonEmptyString(statement.id)) return null;
      statementIds.push(statement.id as string);
    }
    const selected = parseStatementMap(value.userAnswer, statementIds, true);
    const correct = parseStatementMap(value.correctAnswer, statementIds, false);
    if (!selected || !correct) return null;
    let answeredUnits = 0;
    let correctUnits = 0;
    for (const id of statementIds) {
      if (selected[id] !== null) {
        answeredUnits += 1;
        if (selected[id] === correct[id]) correctUnits += 1;
      }
    }
    const computedCompletion: LocalDashboardCompletionState = answeredUnits === 0
      ? 'BLANK'
      : answeredUnits === statementIds.length ? 'COMPLETE' : 'PARTIAL';
    if (completionState !== computedCompletion) return null;
    return {
      questionId,
      questionType,
      completionState,
      correctUnits,
      answeredUnits,
      blankUnits: statementIds.length - answeredUnits,
      totalUnits: statementIds.length,
      topicRefs,
      cognitiveLevel: parseCognitiveLevel(value.question.cognitiveLevel),
    };
  }
  return null;
}

function validateSummaryFields(value: Record<string, unknown>) {
  const mode = mapMode(value.mode);
  if (!mode) return { failure: { status: 'unsupported', reason: 'unsupported-mode' } as LocalDashboardAdapterResult };
  const sessionId = nonEmptyString(value.sessionId);
  if (!sessionId) return { failure: { status: 'malformed', reason: 'missing-identity' } as LocalDashboardAdapterResult };
  const totalScore = finiteNumber(value.totalScore);
  if (totalScore === null) return { failure: { status: 'malformed', reason: 'missing-score' } as LocalDashboardAdapterResult };
  if (totalScore < 0 || totalScore > 10) return { failure: { status: 'malformed', reason: 'invalid-score' } as LocalDashboardAdapterResult };
  const submittedAt = parseLocalDashboardTimestamp(value.submittedAt ?? value.submittedAtServer);
  if (submittedAt === null) return { failure: { status: 'malformed', reason: 'missing-timestamp' } as LocalDashboardAdapterResult };
  const durationValue = value.durationSeconds;
  const durationSeconds = durationValue === undefined
    ? Math.max(0, Math.floor((submittedAt - (parseLocalDashboardTimestamp(value.startedAtServer) ?? submittedAt)) / 1000))
    : finiteNumber(durationValue);
  if (durationSeconds === null || durationSeconds < 0 || durationSeconds > MAX_DURATION_SECONDS) {
    return { failure: { status: 'malformed', reason: 'invalid-duration' } as LocalDashboardAdapterResult };
  }
  const totalQuestions = nonNegativeInteger(value.totalQuestions);
  if (totalQuestions === null || totalQuestions > MAX_TOTAL_QUESTIONS) {
    return { failure: { status: 'malformed', reason: 'invalid-total-questions' } as LocalDashboardAdapterResult };
  }
  return { mode, sessionId, totalScore, submittedAt, durationSeconds, totalQuestions };
}

export function adaptApiSnapshotV2LocalResult(
  value: unknown,
  stableId: string,
): LocalDashboardAdapterResult {
  if (!isRecord(value)) return { status: 'malformed', reason: 'unknown-schema' };
  if (value.snapshotSchemaVersion !== 2) {
    return { status: 'unsupported', reason: 'snapshot-version-mismatch' };
  }
  if (!isRecord(value.summary) || !Array.isArray(value.questions)) {
    return { status: 'malformed', reason: 'unknown-schema' };
  }
  const summaryInput = {
    ...value,
    totalScore: value.summary.totalScore ?? value.totalScore,
    totalQuestions: value.summary.totalQuestions ?? value.totalQuestions,
  };
  const summary = validateSummaryFields(summaryInput);
  if ('failure' in summary) return summary.failure!;
  const questions: LocalDashboardQuestionEvidence[] = [];
  for (const question of value.questions) {
    const parsed = snapshotQuestionEvidence(question);
    if (!parsed) return { status: 'malformed', reason: 'invalid-question-detail' };
    questions.push(parsed);
  }
  if (questions.length !== summary.totalQuestions) return { status: 'malformed', reason: 'invalid-question-detail' };
  const owner = classifyOwner(value);
  return {
    status: 'success',
    attempt: {
      stableId,
      sourceKind: 'api-snapshot-v2-cache',
      sourcePriority: LOCAL_SOURCE_PRIORITY.API_SNAPSHOT_V2,
      sessionId: summary.sessionId,
      localSessionId: null,
      serverSessionId: summary.sessionId,
      clientSubmissionId: nonEmptyString(value.clientSubmissionId),
      ownerScope: owner.scope,
      ownerKey: owner.key,
      mode: summary.mode,
      title: nonEmptyString(value.title) ?? 'Bài thi đã lưu',
      totalScore: summary.totalScore,
      durationSeconds: Math.floor(summary.durationSeconds),
      submittedAt: summary.submittedAt,
      totalQuestions: summary.totalQuestions,
      scoreAuthority: scoreAuthority(value.scoreAuthority),
      timingAuthority: timingAuthority(value.timingAuthority),
      submissionOrigin: submissionOrigin(value.submissionOrigin),
      datasetVersion: nonEmptyString(value.datasetVersion),
      examContentHash: nonEmptyString(value.examContentHash),
      detailStatus: 'full',
      normalizedQuestions: questions,
      pendingRecovery: false,
      malformedReason: null,
    },
  };
}

function legacyQuestionEvidence(value: unknown): LocalDashboardQuestionEvidence | null {
  if (!isRecord(value)) return null;
  const questionId = nonEmptyString(value.questionId);
  const questionType = value.questionType;
  if (!questionId || (questionType !== 'mcq' && questionType !== 'true_false')) return null;
  // Legacy không có slug backend-authoritative. Giữ phân tích dạng câu, nhưng
  // không tự chế topic key/cognitive metadata khác policy backend.
  const topicRefs: LocalDashboardTopicRef[] = [];
  const cognitiveLevel = null;
  if (questionType === 'mcq') {
    if (!isRecord(value.mcq)) return null;
    const selected = value.mcq.selected;
    if (!(selected === null || typeof selected === 'string') || typeof value.mcq.correct !== 'string') return null;
    const blank = selected === null;
    // `isCorrect` của writer legacy chỉ dùng để đối chiếu. Không reject bản ghi khi
    // cờ lệch; chấm từ đáp án để giữ dữ liệu local cũ dùng được mà không tin cờ sai.
    const derivedCorrect = !blank && selected === value.mcq.correct;
    return {
      questionId,
      questionType,
      completionState: blank ? 'BLANK' : 'COMPLETE',
      correctUnits: derivedCorrect ? 1 : 0,
      answeredUnits: blank ? 0 : 1,
      blankUnits: blank ? 1 : 0,
      totalUnits: 1,
      topicRefs,
      cognitiveLevel,
    };
  }
  if (!isRecord(value.tf) || !isRecord(value.tf.selected) || !isRecord(value.tf.correct)) return null;
  const statementIds = Object.keys(value.tf.correct);
  if (statementIds.length === 0) return null;
  const selected = parseStatementMap(value.tf.selected, statementIds, true);
  const correct = parseStatementMap(value.tf.correct, statementIds, false);
  if (!selected || !correct) return null;
  let answeredUnits = 0;
  let correctUnits = 0;
  for (const id of statementIds) {
    if (selected[id] !== null) {
      answeredUnits += 1;
      if (selected[id] === correct[id]) correctUnits += 1;
    }
  }
  return {
    questionId,
    questionType,
    completionState: answeredUnits === 0 ? 'BLANK' : answeredUnits === statementIds.length ? 'COMPLETE' : 'PARTIAL',
    correctUnits,
    answeredUnits,
    blankUnits: statementIds.length - answeredUnits,
    totalUnits: statementIds.length,
    topicRefs,
    cognitiveLevel,
  };
}

export function adaptV2LegacyLocalResult(value: unknown, stableId: string): LocalDashboardAdapterResult {
  if (!isRecord(value)) return { status: 'malformed', reason: 'unknown-schema' };
  if ('snapshotSchemaVersion' in value) return { status: 'unsupported', reason: 'snapshot-version-mismatch' };
  const summary = validateSummaryFields(value);
  if ('failure' in summary) return summary.failure!;
  const rawQuestions = value.questions;
  let normalizedQuestions: LocalDashboardQuestionEvidence[] | null = null;
  if (rawQuestions !== undefined) {
    if (!Array.isArray(rawQuestions)) return { status: 'malformed', reason: 'invalid-question-detail' };
    normalizedQuestions = [];
    for (const question of rawQuestions) {
      const parsed = legacyQuestionEvidence(question);
      if (!parsed) return { status: 'malformed', reason: 'invalid-question-detail' };
      normalizedQuestions.push(parsed);
    }
  }
  const owner = classifyOwner(value);
  return {
    status: 'success',
    attempt: {
      stableId,
      sourceKind: 'v2-result',
      sourcePriority: LOCAL_SOURCE_PRIORITY.V2_LEGACY,
      sessionId: summary.sessionId,
      localSessionId: summary.sessionId,
      serverSessionId: nonEmptyString(value.serverSessionId),
      clientSubmissionId: nonEmptyString(value.clientSubmissionId),
      ownerScope: owner.scope,
      ownerKey: owner.key,
      mode: summary.mode,
      title: nonEmptyString(value.title) ?? (summary.mode === 'CUSTOM_MOCK' ? 'Thi thử tùy chọn' : 'Thi thử'),
      totalScore: summary.totalScore,
      durationSeconds: Math.floor(summary.durationSeconds),
      submittedAt: summary.submittedAt,
      totalQuestions: summary.totalQuestions,
      scoreAuthority: scoreAuthority(value.scoreAuthority),
      timingAuthority: timingAuthority(value.timingAuthority),
      submissionOrigin: submissionOrigin(value.submissionOrigin),
      datasetVersion: nonEmptyString(value.datasetVersion),
      examContentHash: nonEmptyString(value.examContentHash),
      detailStatus: normalizedQuestions ? 'question-type-only' : 'summary-only',
      normalizedQuestions,
      pendingRecovery: false,
      malformedReason: null,
    },
  };
}

export function adaptRecoveryLocalResult(
  metadata: LocalDashboardRecoveryMetadata,
  stableId: string,
): LocalDashboardAdapterResult {
  if (metadata.localResult === null) return { status: 'unsupported', reason: 'unknown-schema' };
  const snapshot = adaptApiSnapshotV2LocalResult(metadata.localResult, stableId);
  const adapted = snapshot.status === 'unsupported'
    ? adaptV2LegacyLocalResult(metadata.localResult, stableId)
    : snapshot;
  if (adapted.status !== 'success') return adapted;
  const attempt = adapted.attempt;
  if (attempt.ownerScope === 'authenticated-owner' && attempt.ownerKey !== metadata.ownerKey) {
    return { status: 'success', attempt: { ...attempt, ownerScope: 'conflicting', ownerKey: null } };
  }
  return {
    status: 'success',
    attempt: {
      ...attempt,
      stableId,
      sourceKind: 'recovery-local-result',
      sourcePriority: Math.max(attempt.sourcePriority, LOCAL_SOURCE_PRIORITY.RECOVERY),
      localSessionId: metadata.localSessionId ?? attempt.localSessionId,
      serverSessionId: metadata.serverSessionId ?? attempt.serverSessionId,
      clientSubmissionId: metadata.clientSubmissionId,
      ownerScope: 'authenticated-owner',
      ownerKey: metadata.ownerKey,
      pendingRecovery: metadata.pending,
    },
  };
}
