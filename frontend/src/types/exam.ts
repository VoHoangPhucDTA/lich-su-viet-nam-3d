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

// ============================================================================
// === V2 TYPES – Match 1:1 JSON pipeline ETL (data/exams/*.json) =============
// ============================================================================

export type CognitiveLevel = 'knowledge' | 'comprehension' | 'application';
export type QuestionType = 'mcq' | 'true_false';
export type SectionType = 'mcq' | 'true_false';
export type ScoringRule = 'flat' | 'ladder';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface SourceRef {
  title: string;
  location: string;
}

export interface MCQOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface TFStatement {
  id: 'a' | 'b' | 'c' | 'd';
  text: string;
  isTrue: boolean;
}

interface QuestionBase {
  id: string;
  orderInExam: number;
  questionText: string;
  explanation: string;
  difficulty: DifficultyLevel;
  topic: string;
  cognitiveLevel: CognitiveLevel;
  hasImage: boolean;
  sourceRefs: SourceRef[];
}

export interface MCQQuestion extends QuestionBase {
  questionType: 'mcq';
  options: MCQOption[];
  correctOptionId: 'A' | 'B' | 'C' | 'D';
}

export interface TFQuestion extends QuestionBase {
  questionType: 'true_false';
  statements: TFStatement[];
}

export type Question = MCQQuestion | TFQuestion;

export interface ExamSection {
  sectionId: string;
  sectionType: SectionType;
  title: string;
  totalQuestions: number;
  maxScore: number;
  scorePerQuestion?: number;
  scoringRule?: ScoringRule;
  questions: Question[];
}

export interface VerificationLayer {
  layer: string;
  all_passed?: boolean;
  passed?: number;
  total?: number;
  n_conflicts?: number;
  n_suspicious?: number;
  [key: string]: unknown;
}

export interface VerificationReport {
  structural: VerificationLayer;
  cross_source: VerificationLayer;
  content_integrity: VerificationLayer;
  verified_at: string;
}

export interface ExamFile {
  examId: string;
  title: string;
  year: number;
  source: string;
  sourceDetail: string;
  examCode: string;
  format: 'thpt_2025' | string;
  timeLimitMinutes: number;
  totalScore: number;
  parsedAt: string;
  sections: ExamSection[];
  warnings: string[] | null;
  verification?: VerificationReport;
}

export interface ExamManifestEntry {
  examId: string;
  title: string;
  year: number;
  sourceDetail: string;
  format: string;
  timeLimitMinutes: number;
  totalScore: number;
  mcqCount: number;
  tfCount: number;
  structuralPassed: boolean;
  crossSourcePassed: boolean;
  hasContentSuspicion: boolean;
  fileName: string;
}

export type ExamsManifest = ExamManifestEntry[];

export interface TopicIndexEntry {
  examId: string;
  questionId: string;
  cognitiveLevel: CognitiveLevel;
  difficulty: DifficultyLevel;
  questionType: QuestionType;
}

export type TopicIndex = Record<string, TopicIndexEntry[]>;

export type CustomExamMode = 'custom_practice' | 'custom_mock';
export type CustomExamScopeType = 'all' | 'topic' | 'period';

export interface QuestionRef {
  examId: string;
  questionId: string;
}

export type CustomQuestionSnapshot = Question & {
  sourceExamId: string;
  originalQuestionId: string;
};

export interface CustomExamConfig {
  questionCount: 10 | 20 | 28;
  questionType: 'all' | QuestionType;
  difficulty: 'all' | DifficultyLevel;
  cognitiveLevel: 'all' | CognitiveLevel;
  scopeType: CustomExamScopeType;
  scopeSlug?: string;
  scopeTitle?: string;
  durationSeconds?: number | null;
  mode: CustomExamMode;
}

export interface CustomPracticeState {
  answers: Record<string, AnswerEntry>;
  checked: Record<string, boolean>;
  currentIndex: number;
  finished: boolean;
}

export interface CustomExamSession {
  sessionId: string;
  mode: CustomExamMode;
  title: string;
  createdAt: string;
  startedAt?: number;
  submittedAt?: number;
  durationSeconds?: number | null;
  status?: 'in_progress' | 'submitted';
  config: CustomExamConfig;
  questionRefs: QuestionRef[];
  sourceExamIds: string[];
  questionSnapshots: CustomQuestionSnapshot[];
  markedForReview?: string[];
  practiceState?: CustomPracticeState;
}

export type ExamSessionMode = 'thi_thu' | 'luyen_tap' | 'on_chu_de';
export type ExamResultMode = ExamSessionMode | CustomExamMode;

export interface MCQAnswer {
  questionId: string;
  questionType: 'mcq';
  selected: 'A' | 'B' | 'C' | 'D' | null;
}

export interface TFAnswer {
  questionId: string;
  questionType: 'true_false';
  selected: Record<'a' | 'b' | 'c' | 'd', boolean | null>;
}

export type AnswerEntry = MCQAnswer | TFAnswer;

export interface SessionState {
  sessionId: string;
  mode: ExamSessionMode;
  examId?: string;
  topic?: string;
  questionsRef: string[];
  answers: Record<string, AnswerEntry>;
  flagged: string[];
  startedAt: number;
  serverStartedAt?: number;
  durationSeconds: number;
  status: 'in_progress' | 'submitted';
  submittedAt?: number;
  currentIndex: number;
}

export interface QuestionResult {
  questionId: string;
  questionType: QuestionType;
  isCorrect: boolean;
  pointsEarned: number;
  mcq?: {
    selected: 'A' | 'B' | 'C' | 'D' | null;
    correct: 'A' | 'B' | 'C' | 'D';
  };
  tf?: {
    selected: Record<'a' | 'b' | 'c' | 'd', boolean | null>;
    correct: Record<'a' | 'b' | 'c' | 'd', boolean>;
    correctCount: number;
  };
}

export interface ExamResultV2 {
  sessionId: string;
  examId?: string;
  mode: ExamResultMode;
  title?: string;
  isCustom?: boolean;
  sourceExamIds?: string[];
  questionSnapshots?: CustomQuestionSnapshot[];
  answers?: Record<string, AnswerEntry>;
  config?: CustomExamConfig;
  maxScore?: number;
  score?: number;
  totalScore: number;
  mcqScore: number;
  tfScore: number;
  totalQuestions: number;
  correctMCQ: number;
  wrongMCQ: number;
  blankMCQ: number;
  tfBreakdown: [number, number, number, number, number];
  durationSeconds: number;
  submittedAt: number;
  questions: QuestionResult[];
  userId?: string;
}

export function legacyExamQuestionFromMCQ(q: MCQQuestion): ExamQuestion {
  return {
    id: q.id,
    questionText: q.questionText,
    options: q.options,
    correctOptionId: q.correctOptionId,
    explanation: q.explanation,
    difficulty: q.difficulty,
    grade: 12,
    topic: q.topic,
    sourceRefs: q.sourceRefs,
    cognitiveLevel: q.cognitiveLevel,
  };
}

export function flattenExamQuestions(exam: ExamFile, type?: QuestionType): Question[] {
  const all = exam.sections.flatMap((s) => s.questions);
  return type ? all.filter((q) => q.questionType === type) : all;
}

export function isMCQQuestion(q: Question): q is MCQQuestion {
  return q.questionType === 'mcq';
}

export function isTFQuestion(q: Question): q is TFQuestion {
  return q.questionType === 'true_false';
}
