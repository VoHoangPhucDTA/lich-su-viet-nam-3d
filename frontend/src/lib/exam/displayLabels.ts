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
  if (value === 'all') return 'Tất cả dạng câu';
  return QUESTION_TYPE_LABELS[value as QuestionType] ?? value;
}

export function formatDifficultyLabel(value: DifficultyLevel | string | undefined): string {
  if (!value) return 'Chưa phân loại';
  if (value === 'all') return 'Tất cả độ khó';
  return DIFFICULTY_LABELS[value as DifficultyLevel] ?? value;
}

export function formatCognitiveLevelLabel(value: CognitiveLevel | string | undefined): string {
  if (!value) return 'Chưa phân loại';
  if (value === 'all') return 'Tất cả mức độ';
  return COGNITIVE_LEVEL_LABELS[value as CognitiveLevel] ?? value;
}
