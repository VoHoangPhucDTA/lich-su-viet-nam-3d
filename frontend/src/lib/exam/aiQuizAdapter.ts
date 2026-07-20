import type { MCQQuestion } from '@/types/exam';
import type { AiGeneratedQuizResponse, AiQuizSource, AiQuizViewModel } from '@/types/aiQuiz';

export function adaptAiQuizResponse(response: AiGeneratedQuizResponse, query: string, grade: 10 | 11 | 12): AiQuizViewModel {
  const sourceById = new Map(response.sources.map((source) => [source.chunkId, source]));
  const questions: MCQQuestion[] = response.questions.map((question, index) => ({
    id: `ai-${index + 1}-${shortHash(`${question.question}\u0000${question.correctOptionId}`)}`,
    orderInExam: index + 1,
    questionType: 'mcq',
    questionText: question.question,
    options: question.options,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    difficulty: question.difficulty.toLowerCase() as MCQQuestion['difficulty'],
    topic: `${query} (Lớp ${grade})`,
    cognitiveLevel: 'comprehension',
    hasImage: false,
    sourceRefs: [],
  }));
  const sourcesByQuestionId: Record<string, AiQuizSource[]> = {};
  questions.forEach((question, index) => {
    const ids = response.questions[index]?.sourceChunkIds ?? [];
    sourcesByQuestionId[question.id] = ids.flatMap((id) => {
      const source = sourceById.get(id);
      return source ? [source] : [];
    });
  });
  return {
    questions,
    sourcesByQuestionId,
    generation: response.generation,
    hasReviewAdvisory: response.warnings.length > 0,
    generationReceipt: response.generationReceipt,
  };
}

export function formatAiQuizSource(source: AiQuizSource, fallbackGrade: number): string[] {
  const lines = [`Lớp ${source.grade ?? fallbackGrade}`];
  if (source.lessonNumber !== null) lines.push(`Bài ${source.lessonNumber}`);
  if (source.lessonTitle?.trim()) lines.push(source.lessonTitle.trim());
  if (source.sectionTitle?.trim()) lines.push(source.sectionTitle.trim());
  if (source.pageStart !== null) {
    lines.push(source.pageEnd !== null && source.pageEnd !== source.pageStart
      ? `Trang ${source.pageStart}–${source.pageEnd}` : `Trang ${source.pageStart}`);
  }
  return [...new Set(lines)];
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 7);
}
