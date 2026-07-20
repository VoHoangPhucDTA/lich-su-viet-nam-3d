import type { MCQQuestion } from './exam';

export type AiQuizDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type AiQuizOptionId = 'A' | 'B' | 'C' | 'D';

export interface AiQuizGenerationRequest {
  query: string;
  grade: 10 | 11 | 12;
  lessonNumber?: number;
  documentId?: string;
  difficulty: AiQuizDifficulty;
  count: number;
  topK: number;
}

export interface AiGeneratedOption {
  id: AiQuizOptionId;
  text: string;
}

export interface AiGeneratedQuestion {
  question: string;
  options: AiGeneratedOption[];
  correctOptionId: AiQuizOptionId;
  explanation: string;
  difficulty: AiQuizDifficulty;
  sourceChunkIds: string[];
}

export interface AiQuizSource {
  chunkId: string;
  documentId: string | null;
  grade: number | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  sectionTitle: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  chunkHash: string | null;
}

export type AiQuizWarning = string;

export interface AiQuizGenerationSummary {
  requestedCount: number;
  generatedCount: number;
  partial: boolean;
}

export interface AiGeneratedQuizResponse {
  questions: AiGeneratedQuestion[];
  sources: AiQuizSource[];
  warnings: AiQuizWarning[];
  generation: AiQuizGenerationSummary;
  generationReceipt: { id: string; expiresAt: string };
}

export interface AiQuizViewModel {
  questions: MCQQuestion[];
  sourcesByQuestionId: Record<string, AiQuizSource[]>;
  generation: AiQuizGenerationSummary;
  hasReviewAdvisory: boolean;
  generationReceipt: { id: string; expiresAt: string };
}
