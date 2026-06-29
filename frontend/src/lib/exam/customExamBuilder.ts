import type {
  CognitiveLevel,
  CustomQuestionSnapshot,
  DifficultyLevel,
  ExamFile,
  Question,
  QuestionRef,
  QuestionType,
  TopicIndex,
  TopicIndexEntry,
} from '@/types/exam';
import { flattenExamQuestions } from '@/types/exam';

export type CustomQuestionTypeFilter = 'all' | QuestionType;
export type CustomDifficultyFilter = 'all' | DifficultyLevel;
export type CustomCognitiveLevelFilter = 'all' | CognitiveLevel;

export interface CustomExamPreviewFilters {
  questionCount: number;
  questionType: CustomQuestionTypeFilter;
  difficulty: CustomDifficultyFilter;
  cognitiveLevel: CustomCognitiveLevelFilter;
  refs: TopicIndexEntry[];
}

export interface CustomExamPreviewBreakdown {
  questionType: Record<QuestionType, number>;
  difficulty: Record<DifficultyLevel, number>;
  cognitiveLevel: Record<CognitiveLevel, number>;
}

export interface CustomExamPreview {
  matchedCount: number;
  takeCount: number;
  refs: TopicIndexEntry[];
  breakdown: CustomExamPreviewBreakdown;
}

const EMPTY_BREAKDOWN: CustomExamPreviewBreakdown = {
  questionType: { mcq: 0, true_false: 0 },
  difficulty: { easy: 0, medium: 0, hard: 0 },
  cognitiveLevel: { knowledge: 0, comprehension: 0, application: 0 },
};

export function getAllTopicIndexRefs(index: TopicIndex): TopicIndexEntry[] {
  return dedupeQuestionRefs(Object.values(index).flat());
}

export function dedupeQuestionRefs(refs: TopicIndexEntry[]): TopicIndexEntry[] {
  const unique = new Map<string, TopicIndexEntry>();
  for (const ref of refs) unique.set(`${ref.examId}:${ref.questionId}`, ref);
  return Array.from(unique.values());
}

export function buildCustomExamPreview(filters: CustomExamPreviewFilters): CustomExamPreview {
  const refs = dedupeQuestionRefs(filters.refs).filter((ref) => {
    if (filters.questionType !== 'all' && ref.questionType !== filters.questionType) return false;
    if (filters.difficulty !== 'all' && ref.difficulty !== filters.difficulty) return false;
    if (filters.cognitiveLevel !== 'all' && ref.cognitiveLevel !== filters.cognitiveLevel) return false;
    return true;
  });

  const breakdown: CustomExamPreviewBreakdown = {
    questionType: { ...EMPTY_BREAKDOWN.questionType },
    difficulty: { ...EMPTY_BREAKDOWN.difficulty },
    cognitiveLevel: { ...EMPTY_BREAKDOWN.cognitiveLevel },
  };

  for (const ref of refs) {
    breakdown.questionType[ref.questionType] += 1;
    breakdown.difficulty[ref.difficulty] += 1;
    breakdown.cognitiveLevel[ref.cognitiveLevel] += 1;
  }

  return {
    matchedCount: refs.length,
    takeCount: Math.min(filters.questionCount, refs.length),
    refs,
    breakdown,
  };
}

export function pickCustomQuestionRefs(refs: TopicIndexEntry[], count: number): QuestionRef[] {
  return shuffleArray(dedupeQuestionRefs(refs))
    .slice(0, Math.max(0, count))
    .map((ref) => ({ examId: ref.examId, questionId: ref.questionId }));
}

export function getSourceExamIds(refs: QuestionRef[]): string[] {
  return Array.from(new Set(refs.map((ref) => ref.examId)));
}

export function buildCustomQuestionSnapshots(
  selectedRefs: QuestionRef[],
  exams: ExamFile[]
): CustomQuestionSnapshot[] {
  const examMap = new Map(exams.map((exam) => [exam.examId, exam]));
  const questionMap = new Map<string, Question>();

  for (const exam of exams) {
    for (const question of flattenExamQuestions(exam)) {
      questionMap.set(`${exam.examId}:${question.id}`, question);
    }
  }

  const snapshots: CustomQuestionSnapshot[] = [];
  for (const ref of selectedRefs) {
    const sourceExam = examMap.get(ref.examId);
    const question = questionMap.get(`${ref.examId}:${ref.questionId}`);
    if (!sourceExam || !question) continue;
    snapshots.push({
      ...question,
      id: `${ref.examId}:${question.id}`,
      sourceExamId: ref.examId,
      originalQuestionId: question.id,
    } as CustomQuestionSnapshot);
  }

  return snapshots;
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
