import type { CognitiveLevel, DifficultyLevel, QuestionType } from '@/types/exam';

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

const COGNITIVE_LEVEL_LABELS: Record<CognitiveLevel, string> = {
  knowledge: 'Nhận biết',
  comprehension: 'Thông hiểu',
  application: 'Vận dụng',
};

export function formatQuestionTypeLabel(value: QuestionType | string | undefined): string {
  if (!value) return 'Chưa phân loại';
  return QUESTION_TYPE_LABELS[value as QuestionType] ?? value;
}

export function formatDifficultyLabel(value: DifficultyLevel | string | undefined): string {
  if (!value) return 'Chưa phân loại';
  return DIFFICULTY_LABELS[value as DifficultyLevel] ?? value;
}

export function formatCognitiveLevelLabel(value: CognitiveLevel | string | undefined): string {
  if (!value) return 'Chưa phân loại';
  return COGNITIVE_LEVEL_LABELS[value as CognitiveLevel] ?? value;
}
