// ─── Quiz Module Types ────────────────────────────────────────────────────────
// Backend-ready: these types map 1:1 with the planned FastAPI/LangChain schema.

import type { EventType } from './event';

// ── Enums / Union types ──────────────────────────────────────────────────────

export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

export type CognitiveLevel = 'knowledge' | 'comprehension' | 'application' | 'mixed';

export type QuestionSource = 'textbook' | 'event_data' | 'textbook_wiki';

export type QuizSourceMode = 'event' | 'topic' | 'period' | 'grade' | 'mixed';

export type QuestionStatus = 'unanswered' | 'answered' | 'flagged';

export type QuizGrade = 10 | 11 | 12 | 'all';

// ── Core entities ────────────────────────────────────────────────────────────

export interface QuizOption {
  /** A | B | C | D */
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface SourceRef {
  /** e.g. "SGK Lịch sử 10" */
  title: string;
  /** e.g. "Chương 3, Bài 12" or a URL */
  location: string;
}

export interface QuizQuestion {
  id: string;
  questionText: string;
  options: QuizOption[];
  /** The id of the correct option ('A' | 'B' | 'C' | 'D') */
  correctOptionId: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: Exclude<QuizDifficulty, 'mixed'>;
  grade: QuizGrade;
  topic: string;
  /** Optional link to a specific historical event */
  eventId?: string;
  eventTitle?: string;
  eventType?: EventType;
  /** Reference materials (simulated SGK pages) */
  sourceRefs: SourceRef[];
  /** 'mock' for seeded data, 'rag' for LangChain-generated questions */
  generatedBy: 'mock' | 'rag';
  /** RAG confidence score 0-1 (only present for rag questions) */
  confidence?: number;
}

// ── Session types ─────────────────────────────────────────────────────────────

export interface QuizConfig {
  /** How many questions to generate (default: 10) */
  questionCount: number;
  difficulty: QuizDifficulty;
  sourceMode: QuizSourceMode;
  /** Filter by school grade */
  grade?: QuizGrade;
  /** Filter by specific event IDs */
  eventIds?: string[];
  /** Filter by topic keyword */
  topic?: string;
  /** Historical period range in years */
  period?: { from: number; to: number };
  /** Event types to include */
  eventTypes?: EventType[];
  /** Cognitive level (Nhận biết, thông hiểu, vận dụng) */
  cognitiveLevel?: CognitiveLevel;
  /** Source material to use (SGK, Data, Wiki) */
  source?: QuestionSource;
  /** Time limit in minutes (0 = no limit) */
  timeLimitMinutes: number;
}

export interface QuizAnswer {
  questionId: string;
  selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
  /** ms elapsed when user answered */
  timeSpentMs?: number;
}

export interface QuizSession {
  sessionId: string;
  config: QuizConfig;
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  /** Status of each question for UI tracking */
  questionStatuses: Record<string, QuestionStatus>;
  startedAt: string; // ISO 8601
  /** null if not yet submitted */
  submittedAt: string | null;
  /** Index of the currently visible question */
  currentQuestionIndex: number;
  /** userId or 'guest' */
  userId: string;
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface QuizQuestionResult {
  question: QuizQuestion;
  selectedOptionId: 'A' | 'B' | 'C' | 'D' | null;
  isCorrect: boolean;
  timeSpentMs?: number;
}

export interface QuizResult {
  resultId: string;
  sessionId: string;
  userId: string;
  config: QuizConfig;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  /** 0–100 */
  percentageScore: number;
  /** 0–10 */
  score10: number;
  /** Total time in ms */
  totalTimeMs: number;
  completedAt: string; // ISO 8601
  questionResults: QuizQuestionResult[];
  /** Performance per difficulty */
  difficultyBreakdown: {
    easy: { correct: number; total: number };
    medium: { correct: number; total: number };
    hard: { correct: number; total: number };
  };
  /** Performance per grade */
  gradeBreakdown: Partial<Record<QuizGrade, { correct: number; total: number }>>;
}
