/**
 * Exam Types
 *
 * File này chứa CẢ legacy types (giữ để 19 components/exams/* hiện có không vỡ)
 * VÀ new types v2.3 (match 1:1 với JSON pipeline ETL tại data/exams/).
 *
 * Plan migration: tham chiếu context/plan_module_luyen_thi_v2.3.md §10.
 */

// ============================================================================
// === LEGACY TYPES (v1) – Giữ để components hiện có hoạt động ================
// ============================================================================
// Các types này được 19 components/exams/* và pages/exams/* sử dụng. Sẽ thay
// bằng types mới (V2) qua adapter, không xóa ngay để tránh vỡ build.

export type ExamDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type ExamMode = 'practice' | 'thpt_mock' | 'custom';
export type ExamQuestionStatus = 'unanswered' | 'answered' | 'flagged';

export interface ExamOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

/**
 * @deprecated Sẽ thay bằng MCQQuestion (v2). Dùng `legacyExamQuestionFromMCQ()`
 * khi cần convert từ MCQQuestion sang shape này.
 */
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
// Schema gốc: tools/parse_exam_word.py v3.1.2.
// Plan: context/plan_module_luyen_thi_v2.3.md §3.3.

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
  // Lưu ý: không có `correctOptionId`. Đáp án nằm trong từng statement.isTrue.
}

export type Question = MCQQuestion | TFQuestion;

export interface ExamSection {
  sectionId: string;
  sectionType: SectionType;
  title: string;
  totalQuestions: number;
  maxScore: number;
  /** Chỉ MCQ (Phần I): điểm cố định mỗi câu (0.25 cho 24 câu × 6đ tổng). */
  scorePerQuestion?: number;
  /** Chỉ T/F (Phần II): "ladder" – bậc thang theo số ý đúng. */
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

/**
 * Toàn bộ 1 đề thi – match 1:1 với 1 file JSON ở `data/exams/`.
 */
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

// === Manifest – sinh bởi scripts/build-exams-manifest.mjs ====================
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

// === Topic Index – sinh bởi scripts/build-topic-index.mjs ====================
export interface TopicIndexEntry {
  examId: string;
  questionId: string;
  cognitiveLevel: CognitiveLevel;
  difficulty: DifficultyLevel;
  questionType: QuestionType;
}

export type TopicIndex = Record<string, TopicIndexEntry[]>;

// === Session (V2 – cho 3 chế độ học) =========================================
export type ExamSessionMode = 'thi_thu' | 'luyen_tap' | 'on_chu_de';

export interface MCQAnswer {
  questionId: string;
  questionType: 'mcq';
  selected: 'A' | 'B' | 'C' | 'D' | null;
}

export interface TFAnswer {
  questionId: string;
  questionType: 'true_false';
  /** 4 statement, mỗi cái true/false hoặc null nếu chưa chọn. */
  selected: Record<'a' | 'b' | 'c' | 'd', boolean | null>;
}

export type AnswerEntry = MCQAnswer | TFAnswer;

export interface SessionState {
  sessionId: string;
  mode: ExamSessionMode;
  /** Có khi mode='thi_thu' hoặc 'luyen_tap'. Vắng khi 'on_chu_de'. */
  examId?: string;
  /** Có khi mode='on_chu_de'. */
  topic?: string;
  /** List questionId, KHÔNG nhúng full question để giảm size localStorage. */
  questionsRef: string[];
  answers: Record<string, AnswerEntry>;
  flagged: string[];
  /** ms epoch – client time (cho UI). */
  startedAt: number;
  /** ms epoch – server time (chỉ thi_thu, dùng tính timer chính xác). */
  serverStartedAt?: number;
  /** 3000 (50 phút) cho thi_thu, 0 cho luyện tập (vô hạn). */
  durationSeconds: number;
  status: 'in_progress' | 'submitted';
  submittedAt?: number;
  currentIndex: number;
}

// === Result (V2) =============================================================
export interface QuestionResult {
  questionId: string;
  questionType: QuestionType;
  /** MCQ: đúng đáp án; T/F: đúng cả 4 ý. */
  isCorrect: boolean;
  /** MCQ: 0 hoặc 0.25; T/F: theo TF_LADDER_SCORES. */
  pointsEarned: number;
  mcq?: {
    selected: 'A' | 'B' | 'C' | 'D' | null;
    correct: 'A' | 'B' | 'C' | 'D';
  };
  tf?: {
    selected: Record<'a' | 'b' | 'c' | 'd', boolean | null>;
    correct: Record<'a' | 'b' | 'c' | 'd', boolean>;
    /** 0..4. */
    correctCount: number;
  };
}

export interface ExamResultV2 {
  sessionId: string;
  examId?: string;
  mode: ExamSessionMode;
  /** Thang 10 (mcqScore + tfScore, làm tròn 2 chữ số). */
  totalScore: number;
  mcqScore: number;
  tfScore: number;
  totalQuestions: number;
  correctMCQ: number;
  wrongMCQ: number;
  blankMCQ: number;
  /** Histogram: [#câu đúng 0 ý, 1 ý, 2 ý, 3 ý, 4 ý]. Length = 5. */
  tfBreakdown: [number, number, number, number, number];
  durationSeconds: number;
  submittedAt: number;
  questions: QuestionResult[];
  userId?: string;
}

// ============================================================================
// === ADAPTERS – Cầu nối legacy ↔ V2 =========================================
// ============================================================================

/**
 * Convert MCQQuestion (V2) → ExamQuestion (legacy) để 19 components/exams/*
 * hiện có không cần sửa ngay. Adapter sẽ deprecate khi hoàn tất Sprint 2.
 *
 * Lưu ý: legacy yêu cầu `grade` (10|11|12), V2 không có → mặc định 12 (đề THPT).
 * Legacy `cognitiveLevel` có thêm 'mixed', V2 chỉ 3 mức → giữ nguyên giá trị.
 */
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

/**
 * Trích danh sách câu hỏi từ ExamFile, optional filter theo questionType.
 */
export function flattenExamQuestions(exam: ExamFile, type?: QuestionType): Question[] {
  const all = exam.sections.flatMap((s) => s.questions);
  return type ? all.filter((q) => q.questionType === type) : all;
}

/**
 * Type guards.
 */
export function isMCQQuestion(q: Question): q is MCQQuestion {
  return q.questionType === 'mcq';
}

export function isTFQuestion(q: Question): q is TFQuestion {
  return q.questionType === 'true_false';
}
