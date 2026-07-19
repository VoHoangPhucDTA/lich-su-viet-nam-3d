/**
 * scoring.ts
 *
 * Logic chấm điểm cho đề thi THPT 2025 (format thpt_2025):
 *  - Phần I MCQ (24 câu): 0.25 điểm/câu đúng, 0 nếu sai hoặc bỏ trống.
 *  - Phần II T/F (4 câu × 4 ý): bậc thang theo số ý đúng:
 *       0 ý → 0đ | 1 ý → 0.1đ | 2 ý → 0.25đ | 3 ý → 0.5đ | 4 ý → 1.0đ
 *  - Tổng tối đa: 6.0 + 4.0 = 10.0 điểm.
 *
 * Tất cả hàm export là pure functions → dễ unit test, không cần mock.
 */
import {
  type ExamFile,
  type ExamSection,
  type MCQQuestion,
  type TFQuestion,
  type MCQAnswer,
  type TFAnswer,
  type AnswerEntry,
  type SessionState,
  type ExamResultV2,
  type QuestionResult,
  isMCQQuestion,
  isTFQuestion,
} from '@/types/exam';
import {
  MCQ_SCORE_PER_QUESTION,
  MCQ_SECTION_MAX_SCORE,
  TF_LADDER_SCORES,
  TF_SECTION_MAX_SCORE,
} from './examConstants';

// ============================================================================
// === Chấm điểm từng câu =====================================================
// ============================================================================

/**
 * Chấm điểm 1 câu MCQ.
 * - Đúng đáp án: `MCQ_SCORE_PER_QUESTION` (0.25).
 * - Sai hoặc bỏ trống: 0.
 */
export function scoreMCQQuestion(
  q: MCQQuestion,
  answer: MCQAnswer | undefined
): QuestionResult {
  const selected = answer?.selected ?? null;
  const isCorrect = selected !== null && selected === q.correctOptionId;
  return {
    questionId: q.id,
    questionType: 'mcq',
    isCorrect,
    pointsEarned: isCorrect ? MCQ_SCORE_PER_QUESTION : 0,
    mcq: {
      selected,
      correct: q.correctOptionId,
    },
  };
}

/**
 * Chấm điểm 1 câu T/F theo bậc thang THPT 2025.
 * `correctCount` = số ý chọn đúng (chỉ tính ý đã trả lời, bỏ trống ≠ đúng).
 */
export function scoreTFQuestion(
  q: TFQuestion,
  answer: TFAnswer | undefined
): QuestionResult {
  const correctMap = Object.fromEntries(
    q.statements.map((s) => [s.id, s.isTrue])
  ) as Record<'a' | 'b' | 'c' | 'd', boolean>;

  const selected = answer?.selected ?? {
    a: null,
    b: null,
    c: null,
    d: null,
  };

  let correctCount = 0;
  for (const id of ['a', 'b', 'c', 'd'] as const) {
    if (selected[id] !== null && selected[id] === correctMap[id]) {
      correctCount++;
    }
  }

  const pointsEarned = TF_LADDER_SCORES[correctCount];

  return {
    questionId: q.id,
    questionType: 'true_false',
    isCorrect: correctCount === 4,
    pointsEarned,
    tf: {
      selected,
      correct: correctMap,
      correctCount,
    },
  };
}

// ============================================================================
// === Chấm điểm theo Section =================================================
// ============================================================================

export interface SectionScoreResult {
  score: number;
  maxScore: number;
  details: QuestionResult[];
}

/**
 * Chấm điểm toàn bộ Phần I MCQ.
 */
export function scoreMCQSection(
  section: ExamSection,
  answers: Record<string, AnswerEntry>
): SectionScoreResult {
  const details: QuestionResult[] = [];
  let score = 0;

  for (const q of section.questions) {
    if (!isMCQQuestion(q)) continue;
    const ans = answers[q.id] as MCQAnswer | undefined;
    const r = scoreMCQQuestion(q, ans);
    details.push(r);
    score += r.pointsEarned;
  }

  return {
    score: roundScore(score),
    maxScore: section.maxScore,
    details,
  };
}

/**
 * Chấm điểm toàn bộ Phần II T/F.
 */
export function scoreTFSection(
  section: ExamSection,
  answers: Record<string, AnswerEntry>
): SectionScoreResult {
  const details: QuestionResult[] = [];
  let score = 0;

  for (const q of section.questions) {
    if (!isTFQuestion(q)) continue;
    const ans = answers[q.id] as TFAnswer | undefined;
    const r = scoreTFQuestion(q, ans);
    details.push(r);
    score += r.pointsEarned;
  }

  return {
    score: roundScore(score),
    maxScore: section.maxScore,
    details,
  };
}

// ============================================================================
// === Chấm điểm toàn Session =================================================
// ============================================================================

/**
 * Chấm điểm toàn bộ phiên thi từ SessionState + ExamFile.
 * Trả ExamResultV2 đầy đủ để hiển thị trang kết quả.
 */
export function scoreSession(
  session: SessionState,
  exam: ExamFile
): ExamResultV2 {
  const mcqSection = exam.sections.find((s) => s.sectionType === 'mcq');
  const tfSection = exam.sections.find((s) => s.sectionType === 'true_false');

  const mcqResult = mcqSection
    ? scoreMCQSection(mcqSection, session.answers)
    : { score: 0, maxScore: MCQ_SECTION_MAX_SCORE, details: [] };

  const tfResult = tfSection
    ? scoreTFSection(tfSection, session.answers)
    : { score: 0, maxScore: TF_SECTION_MAX_SCORE, details: [] };

  const totalScore = roundScore(mcqResult.score + tfResult.score);
  const allDetails = [...mcqResult.details, ...tfResult.details];

  // MCQ stats
  const mcqDetails = mcqResult.details;
  const correctMCQ = mcqDetails.filter((r) => r.isCorrect).length;
  const blankMCQ = mcqDetails.filter(
    (r) => r.mcq?.selected === null
  ).length;
  const wrongMCQ = mcqDetails.length - correctMCQ - blankMCQ;

  // T/F histogram [#0ý đúng, #1ý, #2ý, #3ý, #4ý]
  const tfBreakdown: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of tfResult.details) {
    const cnt = r.tf?.correctCount ?? 0;
    tfBreakdown[cnt as 0 | 1 | 2 | 3 | 4]++;
  }

  const elapsedSeconds = session.submittedAt != null
    ? Math.max(0, Math.round((session.submittedAt - session.startedAt) / 1000))
    : session.durationSeconds;
  const durationSeconds = Math.min(elapsedSeconds, session.durationSeconds);

  return {
    sessionId: session.sessionId,
    examId: session.examId,
    mode: session.mode,
    totalScore,
    mcqScore: mcqResult.score,
    tfScore: tfResult.score,
    totalQuestions: allDetails.length,
    correctMCQ,
    wrongMCQ,
    blankMCQ,
    tfBreakdown,
    durationSeconds,
    submittedAt: session.submittedAt ?? Date.now(),
    questions: allDetails,
  };
}

// ============================================================================
// === Utilities ==============================================================
// ============================================================================

/** Làm tròn điểm 2 chữ số thập phân (tránh float imprecision). */
export function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

/**
 * Tính phần trăm điểm (0..100).
 */
export function scoreToPercent(score: number, maxScore = 10): number {
  if (maxScore === 0) return 0;
  return Math.round((score / maxScore) * 1000) / 10; // 1 chữ số thập phân
}

/**
 * Phân loại kết quả theo thang điểm THPT:
 * ≥ 8: Giỏi | 6.5–7.9: Khá | 5–6.4: Trung bình | < 5: Yếu
 */
export type ScoreRating = 'gioi' | 'kha' | 'trung_binh' | 'yeu';

export function rateScore(score: number): ScoreRating {
  if (score >= 8) return 'gioi';
  if (score >= 6.5) return 'kha';
  if (score >= 5) return 'trung_binh';
  return 'yeu';
}
