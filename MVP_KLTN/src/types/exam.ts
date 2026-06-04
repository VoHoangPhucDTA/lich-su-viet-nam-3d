/**
 * Exam Types
 */

export type ExamDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type ExamMode = 'practice' | 'thpt_mock' | 'custom';
export type ExamQuestionStatus = 'unanswered' | 'answered' | 'flagged';

export interface ExamOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface ExamQuestion {
  id: string;
  questionText: string;
  options: ExamOption[];
  correctOptionId: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: ExamDifficulty;
  grade: 10 | 11 | 12;
  topic: string;
  period?: { from: number; to: number };
  eventId?: string;
  eventTitle?: string;
  sourceRefs: { title: string; location: string }[];
  cognitiveLevel?: 'knowledge' | 'comprehension' | 'application' | 'mixed';
}

export interface ExamConfig {
  title: string;
  mode: ExamMode;
  gradeScope: (10 | 11 | 12 | 'all')[];
  questionCount: number;
  difficulty: ExamDifficulty;
  period?: { from: number; to: number };
  topics?: string[];
  timeLimitMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

export interface ExamAnswer {
  questionId: string;
  selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
}

export interface ExamSession {
  examId: string;
  config: ExamConfig;
  questions: ExamQuestion[];
  answers: ExamAnswer[];
  startedAt: string;
  submittedAt?: string;
  status: 'in_progress' | 'submitted';
  currentQuestionIndex: number;
  remainingSeconds?: number;
  flaggedQuestions?: string[];
}

export interface ExamResult {
  examId: string;
  userId?: string; // Tích hợp auth nhẹ
  config: ExamConfig;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  score10: number;
  percentage: number;
  durationSeconds: number;
  submittedAt: string;
  answersReview: {
    questionId: string;
    isCorrect: boolean;
    selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
  }[];
}
