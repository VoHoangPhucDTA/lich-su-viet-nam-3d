import { describe, expect, it } from 'vitest';
import {
  classifyDashboardInsight,
  dashboardConfidence,
} from '../dashboardAnalyticsPolicy';
import type {
  DashboardAnalyticsResponseV1,
  DashboardCognitiveLevel,
  DashboardQuestionType,
} from '../dashboardAnalyticsTypes';
import { mapDashboardAnalyticsToViewModel } from '../dashboardMappers';
import type { PersonalLearningDashboardViewModel } from '../dashboardTypes';
import type { LocalDashboardStorage } from '../localAnalytics/localDashboardRepository';
import { loadLocalDashboard } from '../localAnalytics/localDashboardSource';

const NOW = new Date('2026-07-24T05:00:00.000Z');
const OWNER = 'parity-owner';

interface ParityQuestion {
  id: string;
  type: DashboardQuestionType;
  topicSlug: string;
  topicTitle: string;
  cognitiveLevel: DashboardCognitiveLevel | null;
  correctUnits: number;
  totalUnits: number;
  blankUnits: number;
  /** Deliberately contradicts the selected/correct answers to guard answer semantics. */
  misleadingCorrectness?: boolean;
}

interface ParityAttempt {
  sessionId: string;
  submittedAtIso: string;
  mode: 'TIMED_ORIGINAL' | 'CUSTOM_MOCK';
  score: number;
  durationSeconds: number;
  questions: ParityQuestion[];
  legacy?: boolean;
}

interface ParityScenario {
  name: string;
  attempts: ParityAttempt[];
}

class FakeStorage implements LocalDashboardStorage {
  private readonly entries: Array<[string, string]>;

  constructor(values: Record<string, unknown>) {
    this.entries = Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]);
  }

  get length() { return this.entries.length; }
  key(index: number) { return this.entries[index]?.[0] ?? null; }
  getItem(key: string) { return this.entries.find(([candidate]) => candidate === key)?.[1] ?? null; }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(correct: number, total: number): number | null {
  return total > 0 ? round2((correct / total) * 100) : null;
}

function completion(question: ParityQuestion): 'BLANK' | 'PARTIAL' | 'COMPLETE' {
  if (question.blankUnits === question.totalUnits) return 'BLANK';
  return question.blankUnits > 0 ? 'PARTIAL' : 'COMPLETE';
}

function answerMaps(question: ParityQuestion) {
  const ids = Array.from({ length: question.totalUnits }, (_, index) => `s${index}`);
  const correct = Object.fromEntries(ids.map(id => [id, true]));
  const answeredUnits = question.totalUnits - question.blankUnits;
  const selected = Object.fromEntries(ids.map((id, index) => [
    id,
    index < question.correctUnits ? true : index < answeredUnits ? false : null,
  ]));
  return { ids, correct, selected };
}

function buildApiSnapshot(attempt: ParityAttempt) {
  return {
    snapshotSchemaVersion: 2,
    sessionId: attempt.sessionId,
    ownerId: OWNER,
    mode: attempt.mode,
    title: `Attempt ${attempt.sessionId}`,
    datasetVersion: 'parity-v1',
    examContentHash: `hash-${attempt.sessionId}`,
    scoringVersion: 'parity-scoring-v1',
    scoreAuthority: 'BACKEND',
    timingAuthority: 'SERVER',
    submissionOrigin: 'SERVER_ON_TIME',
    startedAtServer: Date.parse(attempt.submittedAtIso) - attempt.durationSeconds * 1000,
    submittedAtServer: Date.parse(attempt.submittedAtIso),
    summary: {
      totalScore: attempt.score,
      totalQuestions: attempt.questions.length,
    },
    questions: attempt.questions.map((question) => {
      if (question.type === 'mcq') {
        const selected = question.blankUnits > 0 ? null : question.correctUnits === 1 ? 'A' : 'B';
        return {
          publicQuestionId: question.id,
          questionInstanceId: `instance-${question.id}`,
          questionType: 'mcq',
          question: {
            questionType: 'mcq',
            questionText: question.id,
            difficulty: 'medium',
            cognitiveLevel: question.cognitiveLevel,
            options: [
              { id: 'A', text: 'A' },
              { id: 'B', text: 'B' },
              { id: 'C', text: 'C' },
              { id: 'D', text: 'D' },
            ],
          },
          userAnswer: selected,
          correctAnswer: 'A',
          correctness: question.misleadingCorrectness ?? question.correctUnits === 1,
          points: 0,
          completionState: completion(question),
          explanation: null,
          sources: [],
          topicRefs: [{
            slug: question.topicSlug,
            title: question.topicTitle,
            periodSlug: null,
            periodTitle: null,
          }],
        };
      }
      const maps = answerMaps(question);
      return {
        publicQuestionId: question.id,
        questionInstanceId: `instance-${question.id}`,
        questionType: 'true_false',
        question: {
          questionType: 'true_false',
          questionText: question.id,
          difficulty: 'medium',
          cognitiveLevel: question.cognitiveLevel,
          statements: maps.ids.map(id => ({ id, text: id })),
        },
        userAnswer: maps.selected,
        correctAnswer: maps.correct,
        correctness: question.misleadingCorrectness ?? question.correctUnits === question.totalUnits,
        points: 0,
        completionState: completion(question),
        explanation: null,
        sources: [],
        topicRefs: [{
          slug: question.topicSlug,
          title: question.topicTitle,
          periodSlug: null,
          periodTitle: null,
        }],
      };
    }),
  };
}

function buildLegacyResult(attempt: ParityAttempt) {
  return {
    sessionId: attempt.sessionId,
    userId: OWNER,
    mode: attempt.mode === 'TIMED_ORIGINAL' ? 'thi_thu' : 'custom_mock',
    title: `Attempt ${attempt.sessionId}`,
    totalScore: attempt.score,
    totalQuestions: attempt.questions.length,
    durationSeconds: attempt.durationSeconds,
    submittedAt: Date.parse(attempt.submittedAtIso),
    scoreAuthority: 'FRONTEND_LEGACY',
    timingAuthority: 'LOCAL',
    submissionOrigin: 'LOCAL_FALLBACK',
    questions: attempt.questions.map((question) => {
      if (question.type === 'mcq') {
        return {
          questionId: question.id,
          questionType: 'mcq',
          isCorrect: question.misleadingCorrectness ?? question.correctUnits === 1,
          pointsEarned: 0,
          mcq: {
            selected: question.blankUnits > 0 ? null : question.correctUnits === 1 ? 'A' : 'B',
            correct: 'A',
          },
        };
      }
      const maps = answerMaps(question);
      return {
        questionId: question.id,
        questionType: 'true_false',
        isCorrect: question.misleadingCorrectness ?? question.correctUnits === question.totalUnits,
        pointsEarned: 0,
        tf: {
          selected: maps.selected,
          correct: maps.correct,
          correctCount: question.correctUnits,
        },
      };
    }),
    // This metadata must not become local topic/cognitive evidence for legacy rows.
    questionSnapshots: attempt.questions.map(question => ({
      id: question.id,
      questionType: question.type,
      topic: question.topicTitle,
      cognitiveLevel: question.cognitiveLevel,
    })),
  };
}

function buildLocalStorage(scenario: ParityScenario): LocalDashboardStorage {
  return new FakeStorage(Object.fromEntries(scenario.attempts.map(attempt => [
    `${attempt.legacy ? 'v2_result_' : 'exam_api_result_'}${attempt.sessionId}`,
    attempt.legacy ? buildLegacyResult(attempt) : buildApiSnapshot(attempt),
  ])));
}

interface Group {
  label: string;
  correctUnits: number;
  totalUnits: number;
  attempts: Set<string>;
}

function buildBackendResponse(scenario: ParityScenario): DashboardAnalyticsResponseV1 {
  const attempts = [...scenario.attempts].sort((left, right) => (
    Date.parse(left.submittedAtIso) - Date.parse(right.submittedAtIso)
    || left.sessionId.localeCompare(right.sessionId)
  ));
  const topics = new Map<string, Group>();
  const cognitive = new Map<DashboardCognitiveLevel, Group>();
  const questionTypes = new Map<DashboardQuestionType, {
    correctUnits: number;
    answeredUnits: number;
    blankUnits: number;
    totalUnits: number;
    partialQuestionCount: number;
    totalQuestionCount: number;
  }>();
  let blankQuestions = 0;
  let reviewedQuestions = 0;
  let partialTfQuestions = 0;
  let tfQuestions = 0;

  const addGroup = (
    map: Map<string, Group>,
    key: string,
    label: string,
    attemptId: string,
    question: ParityQuestion,
  ) => {
    const group = map.get(key) ?? {
      label,
      correctUnits: 0,
      totalUnits: 0,
      attempts: new Set<string>(),
    };
    group.correctUnits += question.correctUnits;
    group.totalUnits += question.totalUnits;
    group.attempts.add(attemptId);
    map.set(key, group);
  };

  for (const attempt of attempts) {
    for (const question of attempt.questions) {
      reviewedQuestions += 1;
      const state = completion(question);
      if (state === 'BLANK') blankQuestions += 1;
      if (question.type === 'true_false') {
        tfQuestions += 1;
        if (state === 'PARTIAL') partialTfQuestions += 1;
      }
      const type = questionTypes.get(question.type) ?? {
        correctUnits: 0,
        answeredUnits: 0,
        blankUnits: 0,
        totalUnits: 0,
        partialQuestionCount: 0,
        totalQuestionCount: 0,
      };
      type.correctUnits += question.correctUnits;
      type.answeredUnits += question.totalUnits - question.blankUnits;
      type.blankUnits += question.blankUnits;
      type.totalUnits += question.totalUnits;
      type.partialQuestionCount += state === 'PARTIAL' ? 1 : 0;
      type.totalQuestionCount += 1;
      questionTypes.set(question.type, type);

      // Backend policy deliberately excludes FRONTEND_LEGACY from deep analytics.
      if (!attempt.legacy) {
        addGroup(topics, question.topicSlug, question.topicTitle, attempt.sessionId, question);
        if (question.cognitiveLevel) {
          addGroup(cognitive, question.cognitiveLevel, question.cognitiveLevel, attempt.sessionId, question);
        }
      }
    }
  }

  const topicRows = [...topics.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topicKey, group]) => {
      const accuracy = percent(group.correctUnits, group.totalUnits) ?? 0;
      const sample = { accuracy, totalUnits: group.totalUnits, attemptCount: group.attempts.size };
      return {
        topicKey,
        topicLabel: group.label,
        accuracy,
        correctUnits: group.correctUnits,
        totalUnits: group.totalUnits,
        attemptCount: group.attempts.size,
        confidence: dashboardConfidence(sample),
        status: classifyDashboardInsight(sample),
      };
    });
  const cognitiveOrder: DashboardCognitiveLevel[] = ['knowledge', 'comprehension', 'application'];
  const cognitiveRows = cognitiveOrder.filter(level => cognitive.has(level)).map(level => {
    const group = cognitive.get(level)!;
    const accuracy = percent(group.correctUnits, group.totalUnits);
    const sample = { accuracy, totalUnits: group.totalUnits, attemptCount: group.attempts.size };
    return {
      level,
      accuracy,
      correctUnits: group.correctUnits,
      totalUnits: group.totalUnits,
      attemptCount: group.attempts.size,
      confidence: dashboardConfidence(sample),
      status: classifyDashboardInsight(sample),
    };
  });
  const scores = attempts.map(attempt => attempt.score);
  const activeDays = new Set(attempts.map(attempt => attempt.submittedAtIso.slice(0, 10))).size;

  return {
    schemaVersion: 1,
    generatedAt: NOW.toISOString(),
    scope: {
      range: '30d',
      timezone: 'Asia/Ho_Chi_Minh',
      fromDate: '2026-06-25',
      toDateExclusive: '2026-07-25',
      attemptModes: ['TIMED_ORIGINAL', 'CUSTOM_MOCK'],
      policyVersion: 'dashboard-v1',
    },
    summary: {
      totalAttempts: attempts.length,
      officialAttemptCount: attempts.filter(attempt => !attempt.legacy).length,
      recoveredAttemptCount: 0,
      legacyAttemptCount: attempts.filter(attempt => attempt.legacy).length,
      averageScore: scores.length ? round2(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      highestScore: scores.length ? Math.max(...scores) : null,
      latestScore: attempts.at(-1)?.score ?? null,
      totalDurationSeconds: attempts.reduce((sum, attempt) => sum + attempt.durationSeconds, 0),
      activeDays,
      mcqAccuracy: questionTypes.has('mcq')
        ? percent(questionTypes.get('mcq')!.correctUnits, questionTypes.get('mcq')!.totalUnits)
        : null,
      tfStatementAccuracy: questionTypes.has('true_false')
        ? percent(questionTypes.get('true_false')!.correctUnits, questionTypes.get('true_false')!.totalUnits)
        : null,
      blankRate: percent(blankQuestions, reviewedQuestions),
      tfPartialRate: percent(partialTfQuestions, tfQuestions),
    },
    trend: attempts.map(attempt => ({
      attemptId: attempt.sessionId,
      submittedAt: attempt.submittedAtIso,
      score: attempt.score,
      mode: attempt.mode,
      title: `Attempt ${attempt.sessionId}`,
    })),
    topics: topicRows,
    cognitiveLevels: cognitiveRows,
    questionTypes: (['mcq', 'true_false'] as const).filter(type => questionTypes.has(type)).map(type => {
      const row = questionTypes.get(type)!;
      return { type, accuracy: percent(row.correctUnits, row.totalUnits), ...row };
    }),
    recentAttempts: [...attempts].reverse().slice(0, 5).map(attempt => ({
      attemptId: attempt.sessionId,
      title: `Attempt ${attempt.sessionId}`,
      mode: attempt.mode,
      score: attempt.score,
      durationSeconds: attempt.durationSeconds,
      submittedAt: attempt.submittedAtIso,
      totalQuestions: attempt.questions.length,
      detailStatus: attempt.legacy ? 'summary-only' : 'full',
      scoreAuthority: attempt.legacy ? 'FRONTEND_LEGACY' : 'BACKEND',
      timingAuthority: attempt.legacy ? 'LOCAL' : 'SERVER',
      submissionOrigin: attempt.legacy ? 'LOCAL_FALLBACK' : 'SERVER_ON_TIME',
    })),
    coverage: {
      totalKnownAttempts: attempts.length,
      fetchedAttemptCount: attempts.length,
      summaryAttemptCount: attempts.length,
      detailedAttemptCount: attempts.filter(attempt => !attempt.legacy).length,
      unsupportedSnapshotCount: 0,
      malformedDetailCount: 0,
      legacySummaryCount: attempts.filter(attempt => attempt.legacy).length,
      fetchLimit: 500,
      isComplete: true,
    },
    authorityBreakdown: {
      backendOnTime: attempts.filter(attempt => !attempt.legacy).length,
      backendLate: 0,
      backendFallback: 0,
      frontendLegacy: attempts.filter(attempt => attempt.legacy).length,
    },
    diagnostics: {
      snapshotVersionCounts: { '2': attempts.filter(attempt => !attempt.legacy).length },
      excludedModeCount: 0,
      excludedInvalidSummaryCount: 0,
    },
  };
}

function parityProjection(viewModel: PersonalLearningDashboardViewModel) {
  const insight = (item: PersonalLearningDashboardViewModel['strengths'][number]) => ({
    key: item.key,
    status: item.status,
    accuracy: item.accuracy,
    correctUnits: item.correctUnits,
    totalUnits: item.totalUnits,
    attemptCount: item.attemptCount,
    confidence: item.confidence,
  });
  return {
    summary: viewModel.summary,
    recommendation: viewModel.recommendations.map(item => ({
      actionRoute: item.actionRoute,
      topicKey: item.topicKey,
    })),
    trend: viewModel.scoreTrend.points.map(({ score, submittedAt }) => ({ score, submittedAt })),
    strengths: viewModel.strengths.map(insight),
    weaknesses: viewModel.weaknesses.map(insight),
    questionTypes: viewModel.questionTypePerformance.map(({
      type, accuracy, correctUnits, totalUnits, blankUnits,
    }) => ({ type, accuracy, correctUnits, totalUnits, blankUnits })),
    cognitive: viewModel.cognitivePerformance.map(({
      level, accuracy, correctUnits, totalUnits, attemptCount, confidence, status,
    }) => ({ level, accuracy, correctUnits, totalUnits, attemptCount, confidence, status })),
    recent: viewModel.recentAttempts.map(({ attemptId, detailStatus }) => ({ attemptId, detailStatus })),
  };
}

const baseQuestion = (
  id: string,
  topicSlug: string,
  correctUnits: number,
  overrides: Partial<ParityQuestion> = {},
): ParityQuestion => ({
  id,
  type: 'true_false',
  topicSlug,
  topicTitle: `Topic ${topicSlug}`,
  cognitiveLevel: 'knowledge',
  correctUnits,
  totalUnits: 4,
  blankUnits: 0,
  ...overrides,
});

const SCENARIOS: ParityScenario[] = [
  {
    name: 'một chủ đề yếu rõ ràng',
    attempts: [
      {
        sessionId: 'weak-1', submittedAtIso: '2026-07-20T03:00:00.000Z', mode: 'TIMED_ORIGINAL',
        score: 4, durationSeconds: 600, questions: [baseQuestion('q1', 'weak-topic', 1)],
      },
      {
        sessionId: 'weak-2', submittedAtIso: '2026-07-21T03:00:00.000Z', mode: 'TIMED_ORIGINAL',
        score: 5, durationSeconds: 700, questions: [baseQuestion('q2', 'weak-topic', 2)],
      },
    ],
  },
  {
    name: 'hai chủ đề yếu với mức độ khác nhau',
    attempts: [
      {
        sessionId: 'severity-1', submittedAtIso: '2026-07-20T03:00:00.000Z', mode: 'TIMED_ORIGINAL',
        score: 5, durationSeconds: 600, questions: [
          baseQuestion('q1', 'alphabet-first', 2),
          baseQuestion('q2', 'more-severe', 0),
        ],
      },
      {
        sessionId: 'severity-2', submittedAtIso: '2026-07-21T03:00:00.000Z', mode: 'TIMED_ORIGINAL',
        score: 5, durationSeconds: 600, questions: [
          baseQuestion('q3', 'alphabet-first', 2),
          baseQuestion('q4', 'more-severe', 1),
        ],
      },
    ],
  },
  {
    name: 'chủ đề xuất hiện ở snapshot và metadata legacy',
    attempts: [
      {
        sessionId: 'snapshot-1', submittedAtIso: '2026-07-20T03:00:00.000Z', mode: 'TIMED_ORIGINAL',
        score: 7, durationSeconds: 600, questions: [baseQuestion('q1', 'shared-topic', 3)],
      },
      {
        sessionId: 'legacy-1', submittedAtIso: '2026-07-21T03:00:00.000Z', mode: 'TIMED_ORIGINAL',
        score: 3, durationSeconds: 600, legacy: true, questions: [baseQuestion('q2', 'shared-topic', 0)],
      },
    ],
  },
  {
    name: 'MCQ có cờ correctness trái với đáp án',
    attempts: [{
      sessionId: 'mcq-answer', submittedAtIso: '2026-07-20T03:00:00.000Z', mode: 'TIMED_ORIGINAL',
      score: 10, durationSeconds: 500, questions: [baseQuestion('mcq', 'mcq-topic', 1, {
        type: 'mcq', totalUnits: 1, misleadingCorrectness: false,
      })],
    }],
  },
  {
    name: 'true-false làm dở dang',
    attempts: [{
      sessionId: 'tf-partial', submittedAtIso: '2026-07-20T03:00:00.000Z', mode: 'CUSTOM_MOCK',
      score: 5, durationSeconds: 400, questions: [baseQuestion('tf', 'tf-topic', 2, { blankUnits: 1 })],
    }],
  },
  {
    name: 'không có bài nào trong khoảng',
    attempts: [],
  },
];

/**
 * Intentional differences: source/scope authority, notices and human-facing
 * recommendation/coverage copy. All semantic metrics below must stay equal.
 */
describe.each(SCENARIOS)('dashboard backend/local parity: $name', (scenario) => {
  it('keeps aggregate conclusions aligned', () => {
    const backend = mapDashboardAnalyticsToViewModel(buildBackendResponse(scenario));
    const local = loadLocalDashboard({
      storage: buildLocalStorage(scenario),
      ownerFilter: { kind: 'authenticated-owner', ownerKey: OWNER },
      range: '30d',
      source: 'local-fallback',
      now: NOW,
    });
    if (scenario.attempts.length === 0) {
      expect(local.kind).toBe('no-data');
      expect(backend.state).toBe('empty');
      return;
    }
    expect(local.kind).toBe('ready');
    if (local.kind !== 'ready') return;
    expect(parityProjection(local.viewModel)).toEqual(parityProjection(backend));
  });
});
