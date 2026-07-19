/**
 * API-first exam DTOs. These intentionally remain separate from the static
 * question-bank types in exam.ts: a question received before checking or
 * submitting must never carry an answer key.
 */

export type ExamSessionMode =
  | 'TIMED_ORIGINAL'
  | 'CUSTOM_MOCK'
  | 'FREE_PRACTICE'
  | 'TOPIC_PRACTICE'
  | 'RETRY_WRONG'
  | 'CUSTOM_PRACTICE';

export type SafeQuestionType = 'mcq' | 'true_false';
export type CompletionState = 'BLANK' | 'PARTIAL' | 'COMPLETE';
export type ExamScoreAuthority = 'BACKEND' | 'LOCAL_FALLBACK' | 'FRONTEND_LEGACY';
export type ExamTimingAuthority = 'SERVER' | 'CLIENT_UNVERIFIED' | 'LOCAL';
export type ExamSubmissionOrigin = 'SERVER_ON_TIME' | 'SERVER_ISSUED_LATE' | 'CLIENT_FALLBACK' | 'LOCAL_FALLBACK';

export interface ApiError {
  code: string;
  message: string;
  status?: number;
}

export interface ExamCatalogItem {
  examId: string;
  title: string;
  year: number | null;
  sourceDetail: string | null;
  format: string;
  timeLimitMinutes: number;
  totalScore: number;
  totalQuestions: number;
  mcqCount: number;
  tfCount: number;
  verificationStatus: string;
  hasWarnings: boolean;
}

export interface ExamCatalogList {
  datasetVersion: string;
  view: string;
  total: number;
  items: ExamCatalogItem[];
}

export interface ExamCatalogDetail {
  datasetVersion: string;
  examId: string;
  title: string;
  year: number | null;
  source: string | null;
  sourceDetail: string | null;
  examCode: string | null;
  format: string;
  timeLimitMinutes: number;
  totalScore: number;
  totalQuestions: number;
  verificationStatus: string;
  hasWarnings: boolean;
  sections: Array<{
    sectionId: string;
    sectionType: SafeQuestionType;
    title: string;
    order: number;
    questionCount: number;
    maxScore: number;
  }>;
}

export interface ExamTopicMetadata {
  slug: string;
  title: string;
  periodSlug: string | null;
  periodTitle: string | null;
  questionCount: number;
  mcqCount: number;
  tfCount: number;
  difficultyBreakdown: Record<string, number>;
  cognitiveLevelBreakdown: Record<string, number>;
}

export interface ExamTopicList {
  datasetVersion: string;
  total: number;
  items: ExamTopicMetadata[];
}

export interface CustomPreviewRequest {
  questionCount: number;
  questionType?: 'all' | SafeQuestionType;
  difficulty?: 'all' | 'easy' | 'medium' | 'hard';
  cognitiveLevel?: 'all' | 'knowledge' | 'comprehension' | 'application';
  scopeType?: 'all' | 'topic' | 'period';
  scopeSlug?: string;
}

export interface CustomPreviewResponse {
  datasetVersion: string;
  normalizedConfig: Required<CustomPreviewRequest>;
  availableCount: number;
  selectedCount: number;
  enoughQuestions: boolean;
  breakdown: {
    questionType: Record<string, number>;
    difficulty: Record<string, number>;
    cognitiveLevel: Record<string, number>;
  };
  warnings: string[];
}

export interface SafeQuestionBase {
  questionType: SafeQuestionType;
  questionText: string;
  difficulty: string | null;
  cognitiveLevel: string | null;
}

export interface SafeMCQQuestion extends SafeQuestionBase {
  questionType: 'mcq';
  options: Array<{ id: 'A' | 'B' | 'C' | 'D'; text: string }>;
}

export interface SafeTFQuestion extends SafeQuestionBase {
  questionType: 'true_false';
  statements: Array<{ id: 'a' | 'b' | 'c' | 'd'; text: string }>;
}

export type SafeQuestion = SafeMCQQuestion | SafeTFQuestion;

export type SubmittedSelection =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | null
  | Record<'a' | 'b' | 'c' | 'd', boolean | null>;

export interface MCQSubmitAnswer {
  questionInstanceId: string;
  questionType: 'mcq';
  selected: 'A' | 'B' | 'C' | 'D' | null;
}

export interface TFSubmitAnswer {
  questionInstanceId: string;
  questionType: 'true_false';
  selected: Record<'a' | 'b' | 'c' | 'd', boolean | null>;
}

export type SubmitAnswer = MCQSubmitAnswer | TFSubmitAnswer;

export interface CheckedQuestionResult {
  userAnswer: SubmittedSelection;
  correctAnswer: SubmittedSelection;
  correct: boolean;
  points: number;
  completionState: CompletionState;
  explanation: string | null;
  correctCount: number;
}

export interface PracticeSummary {
  totalQuestions: number;
  checkedQuestions: number;
  correctQuestions: number;
  points: number;
  untouchedQuestions: number;
}

export interface SessionQuestion {
  questionInstanceId: string;
  publicQuestionId: string;
  position: number;
  question: SafeQuestion;
  checkedResult: CheckedQuestionResult | null;
}

export interface ExamSessionResponse {
  sessionId: string;
  /** Present only in the create response for anonymous sessions. */
  anonymousSessionToken: string | null;
  mode: ExamSessionMode;
  title: string;
  datasetVersion: string;
  examContentHash: string | null;
  scoringVersion: string;
  startedAtServer: number;
  deadlineAt: number | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'SUBMITTED' | 'EXPIRED' | 'CANCELLED';
  questions: SessionQuestion[];
  practiceSummary: PracticeSummary | null;
  anonymousResult: ResultSnapshotV2 | null;
}

export interface CreateExamSessionRequest extends Partial<CustomPreviewRequest> {
  mode: ExamSessionMode;
  examId?: string;
  expectedDatasetVersion?: string;
  sourceAttemptId?: string;
}

export interface SubmitRequest {
  clientSubmissionId: string;
  answers: SubmitAnswer[];
}

export interface RecoveryQuestionRef {
  questionInstanceId: string;
  publicQuestionId: string;
}

export interface RecoverExamSubmissionRequest {
  clientSubmissionId: string;
  serverSessionId?: string;
  localSessionId?: string;
  mode: 'TIMED_ORIGINAL' | 'CUSTOM_MOCK';
  datasetVersion: string;
  examId?: string | null;
  examContentHash?: string | null;
  /** Client-generated integrity hint only; the backend recomputes its canonical receipt hash. */
  localSubmissionHash?: string;
  clientTiming: {
    startedAtClient: number;
    submittedAtClient: number;
  };
  questionRefs: RecoveryQuestionRef[];
  answers: SubmitAnswer[];
}

export interface ExamSessionSubmitResponse {
  sessionId: string;
  receiptStatus: string;
  scoreAuthority: ExamScoreAuthority;
  timingAuthority: ExamTimingAuthority;
  submissionOrigin: ExamSubmissionOrigin;
  result: ResultSnapshotV2;
}

export interface ReviewedQuestion {
  publicQuestionId: string;
  questionInstanceId: string;
  questionType: SafeQuestionType;
  question: SafeQuestion;
  userAnswer: SubmittedSelection;
  correctAnswer: SubmittedSelection;
  correctness: boolean;
  points: number;
  completionState: CompletionState;
  explanation: string | null;
  sources: Array<{ title: string; location: string | null }>;
  topicRefs: Array<{ slug: string; title: string; periodSlug: string | null; periodTitle: string | null }>;
}

export interface ResultSnapshotV2 {
  snapshotSchemaVersion: 2;
  sessionId: string;
  mode: ExamSessionMode;
  title: string;
  datasetVersion: string;
  examContentHash: string | null;
  scoringVersion: string;
  scoreAuthority: ExamScoreAuthority;
  timingAuthority: ExamTimingAuthority;
  submissionOrigin: ExamSubmissionOrigin;
  startedAtServer: number;
  submittedAtServer: number;
  summary: {
    totalScore: number;
    mcqScore: number;
    tfScore: number;
    totalQuestions: number;
    correctMCQ: number;
    wrongMCQ: number;
    blankMCQ: number;
    tfBreakdown: number[];
  };
  questions: ReviewedQuestion[];
}

export interface AttemptAuthorityMetadata {
  scoreAuthority?: ExamScoreAuthority | string | null;
  timingAuthority?: ExamTimingAuthority | string | null;
  submissionOrigin?: ExamSubmissionOrigin | string | null;
  snapshotSchemaVersion?: number | null;
  scoringVersion?: string | null;
  datasetVersion?: string | null;
  examContentHash?: string | null;
}
