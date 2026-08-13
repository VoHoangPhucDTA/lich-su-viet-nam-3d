import type { NormalizedExamResult, NormalizedReviewedQuestion } from './resultAdapters';

export interface DiagnosisEvidence {
  totalUnits: number;
  answeredUnits: number;
  correctUnits: number;
  wrongUnits: number;
  blankUnits: number;
  /** Percentage in the 0..100 range, or null when there is no valid evidence. */
  accuracy: number | null;
}

export type QuestionDiagnosisStatus = 'correct' | 'partial' | 'wrong' | 'blank';
export type DiagnosisQuestionType = 'mcq' | 'true_false';
export type DiagnosisCognitiveLevel = 'knowledge' | 'comprehension' | 'application';

export interface QuestionDiagnosis {
  status: QuestionDiagnosisStatus;
  evidence: DiagnosisEvidence;
}

export interface TopicDiagnosisBucket extends DiagnosisEvidence {
  slug: string;
  title: string;
}

export interface QuestionTypeDiagnosisBucket extends DiagnosisEvidence {
  questionType: DiagnosisQuestionType;
}

export interface CognitiveDiagnosisBucket extends DiagnosisEvidence {
  cognitiveLevel: DiagnosisCognitiveLevel;
}

export interface SingleAttemptDiagnosis {
  overall: DiagnosisEvidence;
  topicBuckets: TopicDiagnosisBucket[];
  priorityTopics: TopicDiagnosisBucket[];
  questionTypeBuckets: QuestionTypeDiagnosisBucket[];
  cognitiveBuckets: CognitiveDiagnosisBucket[];
  isPerfect: boolean;
}

interface EvidenceAccumulator {
  totalUnits: number;
  answeredUnits: number;
  correctUnits: number;
}

interface TopicAccumulator extends EvidenceAccumulator {
  slug: string;
  title: string;
}

const RESERVED_STATEMENT_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const QUESTION_TYPE_ORDER: DiagnosisQuestionType[] = ['mcq', 'true_false'];
const COGNITIVE_ORDER: DiagnosisCognitiveLevel[] = ['knowledge', 'comprehension', 'application'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function evidenceFromCounts(totalUnits: number, answeredUnits: number, correctUnits: number): DiagnosisEvidence {
  return {
    totalUnits,
    answeredUnits,
    correctUnits,
    wrongUnits: answeredUnits - correctUnits,
    blankUnits: totalUnits - answeredUnits,
    accuracy: totalUnits > 0 ? roundPercent((correctUnits / totalUnits) * 100) : null,
  };
}

function emptyAccumulator(): EvidenceAccumulator {
  return { totalUnits: 0, answeredUnits: 0, correctUnits: 0 };
}

function addEvidence(target: EvidenceAccumulator, evidence: DiagnosisEvidence): void {
  target.totalUnits += evidence.totalUnits;
  target.answeredUnits += evidence.answeredUnits;
  target.correctUnits += evidence.correctUnits;
}

function questionStatus(questionType: DiagnosisQuestionType, evidence: DiagnosisEvidence): QuestionDiagnosisStatus {
  if (evidence.answeredUnits === 0) return 'blank';
  if (evidence.correctUnits === evidence.totalUnits) return 'correct';
  if (questionType === 'true_false' && evidence.correctUnits > 0 && evidence.correctUnits < evidence.totalUnits) return 'partial';
  return 'wrong';
}

function actualMcqOptionIds(question: Record<string, unknown>): Set<string> | null {
  if (!Array.isArray(question.options) || question.options.length === 0) return null;
  const ids = new Set<string>();
  for (const option of question.options) {
    if (!isRecord(option)) return null;
    const id = nonEmptyString(option.id);
    if (!id || ids.has(id)) return null;
    ids.add(id);
  }
  return ids;
}

function actualStatementIds(question: Record<string, unknown>): string[] | null {
  if (!Array.isArray(question.statements) || question.statements.length === 0) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const statement of question.statements) {
    if (!isRecord(statement)) return null;
    const id = nonEmptyString(statement.id);
    if (!id || RESERVED_STATEMENT_IDS.has(id) || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

function exactStatementMap(
  value: unknown,
  statementIds: string[],
  allowNull: boolean,
): Record<string, boolean | null> | null {
  if (!isRecord(value)) return null;
  const expectedIds = new Set(statementIds);
  const valueIds = Object.keys(value);
  if (valueIds.length !== statementIds.length || valueIds.some((id) => !expectedIds.has(id))) return null;
  const parsed: Record<string, boolean | null> = Object.create(null);
  for (const statementId of statementIds) {
    if (!Object.hasOwn(value, statementId)) return null;
    const answer = value[statementId];
    if (typeof answer !== 'boolean' && !(allowNull && answer === null)) return null;
    parsed[statementId] = answer;
  }
  return parsed;
}

/** Derives a review row's status and unit evidence without trusting its correctness flag. */
export function buildQuestionDiagnosis(review: NormalizedReviewedQuestion): QuestionDiagnosis | null {
  if (!isRecord(review) || !isRecord(review.question)) return null;
  const questionType = review.question.questionType;

  if (questionType === 'mcq') {
    const optionIds = actualMcqOptionIds(review.question);
    if (!optionIds || typeof review.correctAnswer !== 'string' || !optionIds.has(review.correctAnswer)) return null;
    if (review.userAnswer !== null && (typeof review.userAnswer !== 'string' || !optionIds.has(review.userAnswer))) return null;
    const answeredUnits = review.userAnswer === null ? 0 : 1;
    const correctUnits = answeredUnits === 1 && review.userAnswer === review.correctAnswer ? 1 : 0;
    const evidence = evidenceFromCounts(1, answeredUnits, correctUnits);
    return { status: questionStatus(questionType, evidence), evidence };
  }

  if (questionType === 'true_false') {
    const statementIds = actualStatementIds(review.question);
    if (!statementIds) return null;
    const selected = exactStatementMap(review.userAnswer, statementIds, true);
    const correct = exactStatementMap(review.correctAnswer, statementIds, false);
    if (!selected || !correct) return null;

    let answeredUnits = 0;
    let correctUnits = 0;
    for (const statementId of statementIds) {
      const expected = correct[statementId];
      const answer = selected[statementId];
      if (answer === null) continue;
      answeredUnits += 1;
      if (answer === expected) correctUnits += 1;
    }
    const evidence = evidenceFromCounts(statementIds.length, answeredUnits, correctUnits);
    return { status: questionStatus(questionType, evidence), evidence };
  }

  return null;
}

function cognitiveLevelOf(review: NormalizedReviewedQuestion): DiagnosisCognitiveLevel | null {
  if (!isRecord(review.question)) return null;
  const level = nonEmptyString(review.question.cognitiveLevel);
  return level === 'knowledge' || level === 'comprehension' || level === 'application' ? level : null;
}

function canonicalTopicRefs(review: NormalizedReviewedQuestion): Array<{ slug: string; title: string }> {
  if (!Array.isArray(review.topicRefs)) return [];
  const refs: Array<{ slug: string; title: string }> = [];
  const seen = new Set<string>();
  for (const value of review.topicRefs) {
    if (!isRecord(value)) continue;
    const slug = nonEmptyString(value.slug);
    const title = nonEmptyString(value.title);
    if (!slug || !title || seen.has(slug)) continue;
    seen.add(slug);
    refs.push({ slug, title });
  }
  return refs;
}

function compareSlug(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function comparePriorityTopics(left: TopicDiagnosisBucket, right: TopicDiagnosisBucket): number {
  if (left.wrongUnits !== right.wrongUnits) return right.wrongUnits - left.wrongUnits;
  const leftAccuracy = left.accuracy ?? Number.POSITIVE_INFINITY;
  const rightAccuracy = right.accuracy ?? Number.POSITIVE_INFINITY;
  if (leftAccuracy !== rightAccuracy) return leftAccuracy - rightAccuracy;
  if (left.totalUnits !== right.totalUnits) return right.totalUnits - left.totalUnits;
  return compareSlug(left.slug, right.slug);
}

export function buildSingleAttemptDiagnosis(result: NormalizedExamResult): SingleAttemptDiagnosis {
  const overall = emptyAccumulator();
  const topics = new Map<string, TopicAccumulator>();
  const questionTypes = new Map<DiagnosisQuestionType, EvidenceAccumulator>();
  const cognitiveLevels = new Map<DiagnosisCognitiveLevel, EvidenceAccumulator>();
  const questions: unknown[] = Array.isArray(result?.questions) ? result.questions : [];
  let validQuestionCount = 0;

  for (const value of questions) {
    const review = value as NormalizedReviewedQuestion;
    const diagnosis = buildQuestionDiagnosis(review);
    if (!diagnosis || !isRecord(review.question)) continue;

    validQuestionCount += 1;
    addEvidence(overall, diagnosis.evidence);
    const questionType = review.question.questionType as DiagnosisQuestionType;
    const typeAccumulator = questionTypes.get(questionType) ?? emptyAccumulator();
    addEvidence(typeAccumulator, diagnosis.evidence);
    questionTypes.set(questionType, typeAccumulator);

    const cognitiveLevel = cognitiveLevelOf(review);
    if (cognitiveLevel) {
      const cognitiveAccumulator = cognitiveLevels.get(cognitiveLevel) ?? emptyAccumulator();
      addEvidence(cognitiveAccumulator, diagnosis.evidence);
      cognitiveLevels.set(cognitiveLevel, cognitiveAccumulator);
    }

    for (const topic of canonicalTopicRefs(review)) {
      const topicAccumulator = topics.get(topic.slug) ?? { ...emptyAccumulator(), ...topic };
      addEvidence(topicAccumulator, diagnosis.evidence);
      topics.set(topic.slug, topicAccumulator);
    }
  }

  const overallEvidence = evidenceFromCounts(overall.totalUnits, overall.answeredUnits, overall.correctUnits);
  const topicBuckets = [...topics.values()]
    .map((topic): TopicDiagnosisBucket => ({
      slug: topic.slug,
      title: topic.title,
      ...evidenceFromCounts(topic.totalUnits, topic.answeredUnits, topic.correctUnits),
    }))
    .sort((left, right) => compareSlug(left.slug, right.slug));
  const questionTypeBuckets = QUESTION_TYPE_ORDER
    .filter((questionType) => questionTypes.has(questionType))
    .map((questionType): QuestionTypeDiagnosisBucket => ({
      questionType,
      ...evidenceFromCounts(
        questionTypes.get(questionType)!.totalUnits,
        questionTypes.get(questionType)!.answeredUnits,
        questionTypes.get(questionType)!.correctUnits,
      ),
    }));
  const cognitiveBuckets = COGNITIVE_ORDER
    .filter((cognitiveLevel) => cognitiveLevels.has(cognitiveLevel))
    .map((cognitiveLevel): CognitiveDiagnosisBucket => ({
      cognitiveLevel,
      ...evidenceFromCounts(
        cognitiveLevels.get(cognitiveLevel)!.totalUnits,
        cognitiveLevels.get(cognitiveLevel)!.answeredUnits,
        cognitiveLevels.get(cognitiveLevel)!.correctUnits,
      ),
    }));

  return {
    overall: overallEvidence,
    topicBuckets,
    priorityTopics: topicBuckets
      .filter((topic) => topic.wrongUnits + topic.blankUnits > 0)
      .sort(comparePriorityTopics)
      .slice(0, 3),
    questionTypeBuckets,
    cognitiveBuckets,
    isPerfect: validQuestionCount === questions.length
      && result.totalQuestions === questions.length
      && overallEvidence.totalUnits > 0
      && overallEvidence.wrongUnits === 0
      && overallEvidence.blankUnits === 0,
  };
}
