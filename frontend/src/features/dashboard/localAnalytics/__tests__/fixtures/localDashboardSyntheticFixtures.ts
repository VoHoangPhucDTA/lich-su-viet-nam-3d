const BASE_TIME = Date.parse('2026-07-20T03:00:00.000Z');

export function apiSnapshotFixture(overrides: Record<string, unknown> = {}) {
  return {
    snapshotSchemaVersion: 2,
    sessionId: 'api-session-1',
    mode: 'TIMED_ORIGINAL',
    title: 'Synthetic API snapshot',
    datasetVersion: 'synthetic-dataset-v1',
    examContentHash: 'synthetic-content-hash',
    scoringVersion: 'synthetic-score-v1',
    scoreAuthority: 'BACKEND',
    timingAuthority: 'SERVER',
    submissionOrigin: 'SERVER_ON_TIME',
    startedAtServer: BASE_TIME - 1_800_000,
    submittedAtServer: BASE_TIME,
    summary: {
      totalScore: 7.5,
      mcqScore: 1,
      tfScore: 0.5,
      totalQuestions: 2,
      correctMCQ: 1,
      wrongMCQ: 0,
      blankMCQ: 0,
      tfBreakdown: [0, 0, 1, 0, 0],
    },
    questions: [
      {
        publicQuestionId: 'synthetic-mcq',
        questionInstanceId: 'instance-mcq',
        questionType: 'mcq',
        question: {
          questionType: 'mcq',
          questionText: 'Synthetic MCQ',
          difficulty: 'easy',
          cognitiveLevel: 'knowledge',
          options: [
            { id: 'A', text: 'A' }, { id: 'B', text: 'B' },
            { id: 'C', text: 'C' }, { id: 'D', text: 'D' },
          ],
        },
        userAnswer: 'A',
        correctAnswer: 'A',
        correctness: true,
        points: 0.25,
        completionState: 'COMPLETE',
        explanation: null,
        sources: [],
        topicRefs: [{
          slug: 'synthetic-topic-a', title: 'Synthetic Topic A', periodSlug: null, periodTitle: null,
        }],
      },
      {
        publicQuestionId: 'synthetic-tf',
        questionInstanceId: 'instance-tf',
        questionType: 'true_false',
        question: {
          questionType: 'true_false',
          questionText: 'Synthetic TF',
          difficulty: 'medium',
          cognitiveLevel: 'application',
          statements: [
            { id: 'a', text: 'a' }, { id: 'b', text: 'b' },
            { id: 'c', text: 'c' }, { id: 'd', text: 'd' },
          ],
        },
        userAnswer: { a: true, b: false, c: null, d: null },
        correctAnswer: { a: true, b: true, c: false, d: false },
        correctness: false,
        points: 0.25,
        completionState: 'PARTIAL',
        explanation: null,
        sources: [],
        topicRefs: [
          { slug: 'synthetic-topic-a', title: 'Synthetic Topic A', periodSlug: null, periodTitle: null },
          { slug: 'synthetic-topic-b', title: 'Synthetic Topic B', periodSlug: null, periodTitle: null },
        ],
      },
    ],
    ...overrides,
  };
}

export function v2SummaryFixture(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'legacy-summary-1',
    mode: 'thi_thu',
    title: 'Synthetic legacy summary',
    totalScore: 6.25,
    totalQuestions: 28,
    durationSeconds: 2_400,
    submittedAt: BASE_TIME - 2 * 86_400_000,
    scoreAuthority: 'FRONTEND_LEGACY',
    timingAuthority: 'LOCAL',
    submissionOrigin: 'LOCAL_FALLBACK',
    ...overrides,
  };
}

export function v2DetailedFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...v2SummaryFixture({
      sessionId: 'legacy-detail-1',
      totalQuestions: 2,
      totalScore: 5,
    }),
    questions: [
      {
        questionId: 'legacy-mcq', questionType: 'mcq', isCorrect: false, pointsEarned: 0,
        mcq: { selected: null, correct: 'B' },
      },
      {
        questionId: 'legacy-tf', questionType: 'true_false', isCorrect: false, pointsEarned: 0.25,
        tf: {
          selected: { a: true, b: false, c: null, d: null },
          correct: { a: true, b: true, c: false, d: false },
          correctCount: 1,
        },
      },
    ],
    ...overrides,
  };
}

export function customLocalResultFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...v2DetailedFixture({
      sessionId: 'custom-local-1', mode: 'custom_mock', title: 'Synthetic custom result', totalScore: 4.5,
      scoreAuthority: 'LOCAL_FALLBACK', timingAuthority: 'CLIENT_UNVERIFIED', submissionOrigin: 'CLIENT_FALLBACK',
    }),
    questionSnapshots: [
      {
        id: 'legacy-mcq', questionType: 'mcq', topic: 'Synthetic Topic A', cognitiveLevel: 'knowledge',
        sourceExamId: 'synthetic-source', originalQuestionId: 'original-mcq',
      },
      {
        id: 'legacy-tf', questionType: 'true_false', topic: 'Synthetic Topic B', cognitiveLevel: 'application',
        sourceExamId: 'synthetic-source', originalQuestionId: 'original-tf',
      },
    ],
    ...overrides,
  };
}

export function customSessionFixture(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'custom-local-1',
    mode: 'custom_mock',
    title: 'Synthetic custom session',
    status: 'submitted',
    submittedAt: BASE_TIME,
    questionSnapshots: [{ id: 'q1', questionType: 'mcq' }],
    practiceState: { answers: {}, checked: {}, currentIndex: 0, finished: false },
    ...overrides,
  };
}

export function recoveryQueueItemFixture(overrides: Record<string, unknown> = {}) {
  return {
    storageVersion: 1,
    queuedAt: BASE_TIME,
    ownerId: 'synthetic-owner-a',
    request: {
      clientSubmissionId: 'client-submission-1',
      localSessionId: 'legacy-detail-1',
      mode: 'TIMED_ORIGINAL',
      datasetVersion: 'synthetic-dataset-v1',
      clientTiming: { startedAtClient: BASE_TIME - 1_000, submittedAtClient: BASE_TIME },
      questionRefs: [],
      answers: [],
    },
    localResult: null,
    syncStatus: 'PENDING',
    retryCount: 0,
    ...overrides,
  };
}

export function oldExamResultFixture(overrides: Record<string, unknown> = {}) {
  return {
    examId: 'old-exam-1',
    config: { title: 'Synthetic old exam', mode: 'thpt_mock' },
    totalQuestions: 10,
    correctCount: 6,
    wrongCount: 3,
    blankCount: 1,
    score10: 6,
    percentage: 60,
    durationSeconds: 1_200,
    submittedAt: new Date(BASE_TIME - 4 * 86_400_000).toISOString(),
    answersReview: [],
    ...overrides,
  };
}

export const SYNTHETIC_BASE_TIME = BASE_TIME;
