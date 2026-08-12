import { describe, expect, it } from 'vitest';
import type { NormalizedExamResult, NormalizedReviewedQuestion } from '../resultAdapters';
import { buildQuestionDiagnosis, buildSingleAttemptDiagnosis } from '../singleAttemptDiagnosis';

interface QuestionFixtureOptions {
  id?: string;
  userAnswer?: unknown;
  correctAnswer?: unknown;
  correctness?: boolean;
  cognitiveLevel?: unknown;
  topicRefs?: unknown;
}

function makeMcq(options: QuestionFixtureOptions = {}): NormalizedReviewedQuestion {
  return {
    questionInstanceId: options.id ?? 'mcq-1',
    publicQuestionId: `public-${options.id ?? 'mcq-1'}`,
    question: {
      questionType: 'mcq',
      questionText: 'MCQ question',
      difficulty: null,
      cognitiveLevel: (options.cognitiveLevel ?? null) as string | null,
      options: [
        { id: 'A', text: 'A' },
        { id: 'B', text: 'B' },
        { id: 'C', text: 'C' },
        { id: 'D', text: 'D' },
      ],
    },
    userAnswer: (Object.hasOwn(options, 'userAnswer') ? options.userAnswer : 'A') as NormalizedReviewedQuestion['userAnswer'],
    correctAnswer: (Object.hasOwn(options, 'correctAnswer') ? options.correctAnswer : 'A') as NormalizedReviewedQuestion['correctAnswer'],
    correctness: options.correctness ?? true,
    points: 0,
    completionState: 'COMPLETE',
    explanation: null,
    topicRefs: (options.topicRefs ?? []) as NormalizedReviewedQuestion['topicRefs'],
  };
}

function makeTf(options: QuestionFixtureOptions & { statementIds?: string[] } = {}): NormalizedReviewedQuestion {
  const statementIds = options.statementIds ?? ['a', 'b', 'c', 'd'];
  const defaultCorrect = Object.fromEntries(statementIds.map((id, index) => [id, index % 2 === 0]));
  return {
    questionInstanceId: options.id ?? 'tf-1',
    publicQuestionId: `public-${options.id ?? 'tf-1'}`,
    question: {
      questionType: 'true_false',
      questionText: 'True/false question',
      difficulty: null,
      cognitiveLevel: (options.cognitiveLevel ?? null) as string | null,
      statements: statementIds.map((id) => ({ id, text: id })) as never,
    },
    userAnswer: (Object.hasOwn(options, 'userAnswer') ? options.userAnswer : defaultCorrect) as NormalizedReviewedQuestion['userAnswer'],
    correctAnswer: (Object.hasOwn(options, 'correctAnswer') ? options.correctAnswer : defaultCorrect) as NormalizedReviewedQuestion['correctAnswer'],
    correctness: options.correctness ?? true,
    points: 0,
    completionState: 'COMPLETE',
    explanation: null,
    topicRefs: (options.topicRefs ?? []) as NormalizedReviewedQuestion['topicRefs'],
  };
}

function makeResult(questions: NormalizedReviewedQuestion[]): NormalizedExamResult {
  return {
    source: 'snapshot_v2',
    sessionId: 'session-1',
    title: 'Test result',
    mode: 'TIMED_ORIGINAL',
    submittedAt: 1,
    totalScore: 0,
    totalQuestions: questions.length,
    authority: { scoreAuthority: 'BACKEND', timingAuthority: 'SERVER', submissionOrigin: 'SERVER_ON_TIME' },
    questions,
  };
}

function topicRef(slug: string, title: string) {
  return { slug, title, periodSlug: null, periodTitle: null };
}

function topicQuestions(slug: string, outcomes: Array<'correct' | 'wrong' | 'blank'>): NormalizedReviewedQuestion[] {
  return outcomes.map((outcome, index) => makeMcq({
    id: `${slug}-${index}`,
    userAnswer: outcome === 'blank' ? null : outcome === 'correct' ? 'A' : 'B',
    correctAnswer: 'A',
    topicRefs: [topicRef(slug, slug)],
  }));
}

describe('single-attempt diagnosis', () => {
  it('derives a correct MCQ from the answers instead of the correctness flag', () => {
    expect(buildQuestionDiagnosis(makeMcq({ userAnswer: 'B', correctAnswer: 'B', correctness: false }))).toEqual({
      status: 'correct',
      evidence: { totalUnits: 1, answeredUnits: 1, correctUnits: 1, wrongUnits: 0, blankUnits: 0, accuracy: 100 },
    });
  });

  it('derives a wrong MCQ from the answers instead of the correctness flag', () => {
    expect(buildQuestionDiagnosis(makeMcq({ userAnswer: 'A', correctAnswer: 'B', correctness: true }))).toEqual({
      status: 'wrong',
      evidence: { totalUnits: 1, answeredUnits: 1, correctUnits: 0, wrongUnits: 1, blankUnits: 0, accuracy: 0 },
    });
  });

  it('classifies an unanswered MCQ as one blank unit', () => {
    expect(buildQuestionDiagnosis(makeMcq({ userAnswer: null }))).toEqual({
      status: 'blank',
      evidence: { totalUnits: 1, answeredUnits: 0, correctUnits: 0, wrongUnits: 0, blankUnits: 1, accuracy: 0 },
    });
  });

  it('classifies a T/F question with 4/4 correct statements as correct', () => {
    const diagnosis = buildQuestionDiagnosis(makeTf({
      userAnswer: { a: true, b: false, c: true, d: false },
      correctAnswer: { a: true, b: false, c: true, d: false },
    }));

    expect(diagnosis).toEqual({
      status: 'correct',
      evidence: { totalUnits: 4, answeredUnits: 4, correctUnits: 4, wrongUnits: 0, blankUnits: 0, accuracy: 100 },
    });
  });

  it('classifies a fully answered T/F question with 3/4 correct statements as partial', () => {
    const diagnosis = buildQuestionDiagnosis(makeTf({
      userAnswer: { a: true, b: false, c: true, d: false },
      correctAnswer: { a: true, b: false, c: true, d: true },
    }));

    expect(diagnosis).toEqual({
      status: 'partial',
      evidence: { totalUnits: 4, answeredUnits: 4, correctUnits: 3, wrongUnits: 1, blankUnits: 0, accuracy: 75 },
    });
  });

  it('classifies a fully answered T/F question with 1/4 correct statements as partial', () => {
    const diagnosis = buildQuestionDiagnosis(makeTf({
      userAnswer: { a: true, b: true, c: false, d: true },
      correctAnswer: { a: true, b: false, c: true, d: false },
    }));

    expect(diagnosis).toEqual({
      status: 'partial',
      evidence: { totalUnits: 4, answeredUnits: 4, correctUnits: 1, wrongUnits: 3, blankUnits: 0, accuracy: 25 },
    });
  });

  it('keeps wrong and blank T/F units separate for a partially answered question', () => {
    const diagnosis = buildQuestionDiagnosis(makeTf({
      userAnswer: { a: true, b: true, c: null, d: null },
      correctAnswer: { a: true, b: false, c: true, d: false },
    }));

    expect(diagnosis).toEqual({
      status: 'partial',
      evidence: { totalUnits: 4, answeredUnits: 2, correctUnits: 1, wrongUnits: 1, blankUnits: 2, accuracy: 25 },
    });
  });

  it('classifies an answered T/F question with zero correct units as wrong', () => {
    const diagnosis = buildQuestionDiagnosis(makeTf({
      statementIds: ['a', 'b'],
      userAnswer: { a: false, b: true },
      correctAnswer: { a: true, b: false },
    }));

    expect(diagnosis).toEqual({
      status: 'wrong',
      evidence: { totalUnits: 2, answeredUnits: 2, correctUnits: 0, wrongUnits: 2, blankUnits: 0, accuracy: 0 },
    });
  });

  it('classifies an all-null T/F answer map as blank', () => {
    const diagnosis = buildQuestionDiagnosis(makeTf({
      statementIds: ['a', 'b', 'c'],
      userAnswer: { a: null, b: null, c: null },
    }));

    expect(diagnosis).toEqual({
      status: 'blank',
      evidence: { totalUnits: 3, answeredUnits: 0, correctUnits: 0, wrongUnits: 0, blankUnits: 3, accuracy: 0 },
    });
  });

  it('returns null for malformed optional question evidence without throwing', () => {
    const missingMcqKey = makeMcq({ correctAnswer: null });
    const incompleteTfKey = makeTf({ statementIds: ['a', 'b'], correctAnswer: { a: true } });
    const malformedQuestion = { ...makeMcq(), question: null } as never;
    const duplicateMcqOption = makeMcq();
    duplicateMcqOption.question = {
      ...duplicateMcqOption.question,
      options: [{ id: 'A', text: 'A' }, { id: 'A', text: 'Duplicate A' }],
    } as never;
    const selectedOutsideOptions = makeMcq();
    selectedOutsideOptions.question = {
      ...selectedOutsideOptions.question,
      options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }],
    } as never;
    selectedOutsideOptions.userAnswer = 'C';
    const duplicateTfStatement = makeTf({
      statementIds: ['a', 'a'],
      userAnswer: { a: true },
      correctAnswer: { a: true },
    });
    const extraTfAnswer = makeTf({
      statementIds: ['a', 'b'],
      userAnswer: { a: true, b: false, c: null },
      correctAnswer: { a: true, b: false },
    });
    const nullTfMap = makeTf({ statementIds: ['a'], userAnswer: null });

    expect(() => buildQuestionDiagnosis(malformedQuestion)).not.toThrow();
    expect(buildQuestionDiagnosis(missingMcqKey)).toBeNull();
    expect(buildQuestionDiagnosis(incompleteTfKey)).toBeNull();
    expect(buildQuestionDiagnosis(malformedQuestion)).toBeNull();
    expect(buildQuestionDiagnosis(duplicateMcqOption)).toBeNull();
    expect(buildQuestionDiagnosis(selectedOutsideOptions)).toBeNull();
    expect(buildQuestionDiagnosis(duplicateTfStatement)).toBeNull();
    expect(buildQuestionDiagnosis(extraTfAnswer)).toBeNull();
    expect(buildQuestionDiagnosis(nullTfMap)).toBeNull();
  });

  it('skips malformed questions while retaining valid aggregate evidence', () => {
    const malformed = makeTf({ statementIds: ['a', 'b'], correctAnswer: { a: true } });
    const diagnosis = buildSingleAttemptDiagnosis(makeResult([
      makeMcq({ id: 'valid', userAnswer: 'A', correctAnswer: 'A' }),
      malformed,
    ]));

    expect(diagnosis.overall).toEqual({ totalUnits: 1, answeredUnits: 1, correctUnits: 1, wrongUnits: 0, blankUnits: 0, accuracy: 100 });
    expect(diagnosis.questionTypeBuckets.map((bucket) => bucket.questionType)).toEqual(['mcq']);
    expect(diagnosis.isPerfect).toBe(false);
  });

  it('returns null accuracy and no buckets when there is no valid evidence', () => {
    const diagnosis = buildSingleAttemptDiagnosis(makeResult([]));

    expect(diagnosis).toMatchObject({
      overall: { totalUnits: 0, answeredUnits: 0, correctUnits: 0, wrongUnits: 0, blankUnits: 0, accuracy: null },
      topicBuckets: [],
      priorityTopics: [],
      questionTypeBuckets: [],
      cognitiveBuckets: [],
    });
  });

  it('uses only canonical nonempty topic slugs and titles', () => {
    const diagnosis = buildSingleAttemptDiagnosis(makeResult([makeMcq({
      topicRefs: [
        topicRef(' topic-a ', ' Topic A '),
        topicRef('', 'Missing slug'),
        topicRef('missing-title', '   '),
        null,
      ],
    })]));

    expect(diagnosis.topicBuckets).toEqual([{
      slug: 'topic-a',
      title: 'Topic A',
      totalUnits: 1,
      answeredUnits: 1,
      correctUnits: 1,
      wrongUnits: 0,
      blankUnits: 0,
      accuracy: 100,
    }]);
  });

  it('deduplicates a topic slug within a question while allowing overlapping topic refs', () => {
    const first = makeTf({
      statementIds: ['a', 'b'],
      userAnswer: { a: true, b: true },
      correctAnswer: { a: true, b: false },
      topicRefs: [topicRef('topic-a', 'Topic A'), topicRef('topic-a', 'Duplicate A'), topicRef('topic-b', 'Topic B')],
    });
    const second = makeMcq({ topicRefs: [topicRef('topic-a', 'Topic A')] });
    const diagnosis = buildSingleAttemptDiagnosis(makeResult([first, second]));

    expect(diagnosis.topicBuckets).toEqual([
      expect.objectContaining({ slug: 'topic-a', title: 'Topic A', totalUnits: 3, correctUnits: 2 }),
      expect.objectContaining({ slug: 'topic-b', title: 'Topic B', totalUnits: 2, correctUnits: 1 }),
    ]);
  });

  it('limits priority topics to three and applies the required stable ordering', () => {
    const questions = [
      ...topicQuestions('highest-wrong', ['wrong', 'wrong', 'wrong']),
      ...topicQuestions('larger-sample', ['wrong', 'wrong', 'blank', 'blank']),
      ...topicQuestions('alpha-tie', ['wrong', 'wrong', 'blank']),
      ...topicQuestions('beta-tie', ['wrong', 'wrong', 'blank']),
      ...topicQuestions('higher-accuracy', ['wrong', 'wrong', 'correct']),
      ...topicQuestions('perfect-topic', ['correct']),
    ];
    const diagnosis = buildSingleAttemptDiagnosis(makeResult(questions));

    expect(diagnosis.priorityTopics.map((topic) => topic.slug)).toEqual([
      'highest-wrong',
      'larger-sample',
      'alpha-tie',
    ]);
    expect(diagnosis.priorityTopics).toHaveLength(3);
    expect(diagnosis.priorityTopics.some((topic) => topic.slug === 'perfect-topic')).toBe(false);
  });

  it('builds question-type buckets only from valid evidence in canonical order', () => {
    const malformedTf = makeTf({ statementIds: ['a'], correctAnswer: {} });
    const diagnosis = buildSingleAttemptDiagnosis(makeResult([
      makeTf({ statementIds: ['a', 'b'], userAnswer: { a: true, b: true }, correctAnswer: { a: true, b: false } }),
      makeMcq({ userAnswer: 'B', correctAnswer: 'A' }),
      malformedTf,
    ]));

    expect(diagnosis.questionTypeBuckets).toEqual([
      { questionType: 'mcq', totalUnits: 1, answeredUnits: 1, correctUnits: 0, wrongUnits: 1, blankUnits: 0, accuracy: 0 },
      { questionType: 'true_false', totalUnits: 2, answeredUnits: 2, correctUnits: 1, wrongUnits: 1, blankUnits: 0, accuracy: 50 },
    ]);
  });

  it('includes only canonical cognitive levels in their fixed order', () => {
    const diagnosis = buildSingleAttemptDiagnosis(makeResult([
      makeMcq({ id: 'application', cognitiveLevel: 'application' }),
      makeMcq({ id: 'unsupported', cognitiveLevel: 'analysis' }),
      makeMcq({ id: 'knowledge', cognitiveLevel: 'knowledge', userAnswer: null }),
      makeMcq({ id: 'comprehension', cognitiveLevel: ' comprehension ', userAnswer: 'B', correctAnswer: 'A' }),
    ]));

    expect(diagnosis.cognitiveBuckets.map((bucket) => bucket.cognitiveLevel)).toEqual([
      'knowledge',
      'comprehension',
      'application',
    ]);
    expect(diagnosis.cognitiveBuckets).toEqual([
      expect.objectContaining({ cognitiveLevel: 'knowledge', totalUnits: 1, blankUnits: 1 }),
      expect.objectContaining({ cognitiveLevel: 'comprehension', totalUnits: 1, wrongUnits: 1 }),
      expect.objectContaining({ cognitiveLevel: 'application', totalUnits: 1, correctUnits: 1 }),
    ]);
  });

  it('sets isPerfect only for nonempty evidence with no wrong or blank units', () => {
    expect(buildSingleAttemptDiagnosis(makeResult([])).isPerfect).toBe(false);
    expect(buildSingleAttemptDiagnosis(makeResult([makeMcq(), makeTf({ statementIds: ['a', 'b'] })])).isPerfect).toBe(true);
    expect(buildSingleAttemptDiagnosis(makeResult([makeMcq({ userAnswer: 'B' })])).isPerfect).toBe(false);
    expect(buildSingleAttemptDiagnosis(makeResult([makeMcq({ userAnswer: null })])).isPerfect).toBe(false);
    expect(buildSingleAttemptDiagnosis(makeResult([makeMcq({ correctAnswer: null })])).isPerfect).toBe(false);
    expect(buildSingleAttemptDiagnosis({ ...makeResult([makeMcq()]), totalQuestions: 2 }).isPerfect).toBe(false);
  });
});
