/**
 * scoring.test.ts
 *
 * Unit tests cho src/lib/exam/scoring.ts (pure functions – không cần mock).
 * Chạy: npm test
 */
import { describe, it, expect } from 'vitest';
import type {
  MCQQuestion,
  TFQuestion,
  MCQAnswer,
  TFAnswer,
  ExamSection,
  ExamFile,
  SessionState,
} from '@/types/exam';
import {
  scoreMCQQuestion,
  scoreTFQuestion,
  scoreMCQSection,
  scoreTFSection,
  scoreSession,
  roundScore,
  scoreToPercent,
  rateScore,
} from '../scoring';
import {
  MCQ_SCORE_PER_QUESTION,
  TF_LADDER_SCORES,
} from '../examConstants';

// ============================================================================
// === Fixtures ===============================================================
// ============================================================================

/** MCQ – đáp án đúng là 'A'. */
const MCQ_Q1: MCQQuestion = {
  id: 'q1',
  orderInExam: 1,
  questionType: 'mcq',
  questionText: 'Câu hỏi MCQ mẫu 1',
  options: [
    { id: 'A', text: 'Lựa chọn A' },
    { id: 'B', text: 'Lựa chọn B' },
    { id: 'C', text: 'Lựa chọn C' },
    { id: 'D', text: 'Lựa chọn D' },
  ],
  correctOptionId: 'A',
  explanation: 'A là đáp án đúng',
  difficulty: 'easy',
  topic: 'Chủ đề test',
  cognitiveLevel: 'knowledge',
  hasImage: false,
  sourceRefs: [],
};

/** MCQ – đáp án đúng là 'C'. */
const MCQ_Q2: MCQQuestion = {
  ...MCQ_Q1,
  id: 'q2',
  orderInExam: 2,
  correctOptionId: 'C',
};

/**
 * TF – correct answers: a=true, b=false, c=true, d=false.
 * Vì vậy để đúng hoàn toàn phải chọn: a→true, b→false, c→true, d→false.
 */
const TF_Q1: TFQuestion = {
  id: 'tf1',
  orderInExam: 25,
  questionType: 'true_false',
  questionText: 'Câu hỏi T/F mẫu 1',
  statements: [
    { id: 'a', text: 'Mệnh đề a', isTrue: true },
    { id: 'b', text: 'Mệnh đề b', isTrue: false },
    { id: 'c', text: 'Mệnh đề c', isTrue: true },
    { id: 'd', text: 'Mệnh đề d', isTrue: false },
  ],
  explanation: 'Giải thích T/F',
  difficulty: 'medium',
  topic: 'Chủ đề test',
  cognitiveLevel: 'comprehension',
  hasImage: false,
  sourceRefs: [],
};

const TF_Q2: TFQuestion = {
  ...TF_Q1,
  id: 'tf2',
  orderInExam: 26,
};

/** MCQ section chứa 2 câu. */
const MCQ_SECTION: ExamSection = {
  sectionId: 's1',
  sectionType: 'mcq',
  title: 'Phần I',
  totalQuestions: 2,
  maxScore: 6.0,
  scorePerQuestion: 0.25,
  questions: [MCQ_Q1, MCQ_Q2],
};

/** T/F section chứa 2 câu. */
const TF_SECTION: ExamSection = {
  sectionId: 's2',
  sectionType: 'true_false',
  title: 'Phần II',
  totalQuestions: 2,
  maxScore: 4.0,
  scoringRule: 'ladder',
  questions: [TF_Q1, TF_Q2],
};

/** ExamFile tối giản (1 MCQ + 1 TF) dùng cho scoreSession tests. */
const EXAM_FILE: ExamFile = {
  examId: 'exam-test-001',
  title: 'Đề thi mẫu',
  year: 2025,
  source: 'test',
  sourceDetail: 'Test',
  examCode: 'TEST001',
  format: 'thpt_2025',
  timeLimitMinutes: 50,
  totalScore: 10,
  parsedAt: '2025-01-01T00:00:00Z',
  warnings: null,
  sections: [
    { ...MCQ_SECTION, totalQuestions: 1, questions: [MCQ_Q1] },
    { ...TF_SECTION, totalQuestions: 1, questions: [TF_Q1] },
  ],
};

function makeSession(
  answers: Record<string, MCQAnswer | TFAnswer>,
  opts: { submittedAt?: number; durationSeconds?: number } = {}
): SessionState {
  return {
    sessionId: 'sess-test',
    mode: 'thi_thu',
    examId: 'exam-test-001',
    questionsRef: Object.keys(answers),
    answers,
    flagged: [],
    startedAt: 0,
    durationSeconds: opts.durationSeconds ?? 3000,
    status: 'submitted',
    submittedAt: opts.submittedAt,
    currentIndex: 0,
  };
}

// ============================================================================
// === scoreMCQQuestion =======================================================
// ============================================================================

describe('scoreMCQQuestion', () => {
  it('đúng đáp án → isCorrect=true, pointsEarned=MCQ_SCORE_PER_QUESTION', () => {
    const ans: MCQAnswer = { questionId: 'q1', questionType: 'mcq', selected: 'A' };
    const r = scoreMCQQuestion(MCQ_Q1, ans);
    expect(r.isCorrect).toBe(true);
    expect(r.pointsEarned).toBe(MCQ_SCORE_PER_QUESTION);
    expect(r.mcq?.selected).toBe('A');
    expect(r.mcq?.correct).toBe('A');
  });

  it('sai đáp án → isCorrect=false, pointsEarned=0', () => {
    const ans: MCQAnswer = { questionId: 'q1', questionType: 'mcq', selected: 'B' };
    const r = scoreMCQQuestion(MCQ_Q1, ans);
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(0);
  });

  it('bỏ trống (selected=null) → isCorrect=false, pointsEarned=0', () => {
    const ans: MCQAnswer = { questionId: 'q1', questionType: 'mcq', selected: null };
    const r = scoreMCQQuestion(MCQ_Q1, ans);
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(0);
    expect(r.mcq?.selected).toBeNull();
  });

  it('answer=undefined → bỏ trống, isCorrect=false', () => {
    const r = scoreMCQQuestion(MCQ_Q1, undefined);
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(0);
  });

  it('trả đúng questionId và questionType', () => {
    const r = scoreMCQQuestion(MCQ_Q1, undefined);
    expect(r.questionId).toBe('q1');
    expect(r.questionType).toBe('mcq');
  });
});

// ============================================================================
// === scoreTFQuestion ========================================================
// ============================================================================

describe('scoreTFQuestion', () => {
  it('0 ý đúng → pointsEarned=TF_LADDER_SCORES[0]=0', () => {
    const ans: TFAnswer = {
      questionId: 'tf1',
      questionType: 'true_false',
      selected: { a: false, b: true, c: false, d: true }, // tất cả sai
    };
    const r = scoreTFQuestion(TF_Q1, ans);
    expect(r.pointsEarned).toBe(TF_LADDER_SCORES[0]);
    expect(r.tf?.correctCount).toBe(0);
    expect(r.isCorrect).toBe(false);
  });

  it('1 ý đúng → pointsEarned=TF_LADDER_SCORES[1]=0.1', () => {
    const ans: TFAnswer = {
      questionId: 'tf1',
      questionType: 'true_false',
      selected: { a: true, b: true, c: false, d: true }, // chỉ 'a' đúng
    };
    const r = scoreTFQuestion(TF_Q1, ans);
    expect(r.pointsEarned).toBe(TF_LADDER_SCORES[1]);
    expect(r.tf?.correctCount).toBe(1);
  });

  it('2 ý đúng → pointsEarned=TF_LADDER_SCORES[2]=0.25', () => {
    const ans: TFAnswer = {
      questionId: 'tf1',
      questionType: 'true_false',
      selected: { a: true, b: false, c: false, d: true }, // 'a','b' đúng
    };
    const r = scoreTFQuestion(TF_Q1, ans);
    expect(r.pointsEarned).toBe(TF_LADDER_SCORES[2]);
    expect(r.tf?.correctCount).toBe(2);
  });

  it('3 ý đúng → pointsEarned=TF_LADDER_SCORES[3]=0.5', () => {
    const ans: TFAnswer = {
      questionId: 'tf1',
      questionType: 'true_false',
      selected: { a: true, b: false, c: true, d: true }, // 'a','b','c' đúng
    };
    const r = scoreTFQuestion(TF_Q1, ans);
    expect(r.pointsEarned).toBe(TF_LADDER_SCORES[3]);
    expect(r.tf?.correctCount).toBe(3);
  });

  it('4 ý đúng → pointsEarned=TF_LADDER_SCORES[4]=1.0, isCorrect=true', () => {
    const ans: TFAnswer = {
      questionId: 'tf1',
      questionType: 'true_false',
      selected: { a: true, b: false, c: true, d: false }, // tất cả đúng
    };
    const r = scoreTFQuestion(TF_Q1, ans);
    expect(r.pointsEarned).toBe(TF_LADDER_SCORES[4]);
    expect(r.tf?.correctCount).toBe(4);
    expect(r.isCorrect).toBe(true);
  });

  it('answer=undefined → 0 ý đúng, pointsEarned=0', () => {
    const r = scoreTFQuestion(TF_Q1, undefined);
    expect(r.pointsEarned).toBe(0);
    expect(r.tf?.correctCount).toBe(0);
  });

  it('ý null (chưa chọn) không tính là đúng', () => {
    const ans: TFAnswer = {
      questionId: 'tf1',
      questionType: 'true_false',
      selected: { a: null, b: null, c: null, d: null }, // chưa chọn gì
    };
    const r = scoreTFQuestion(TF_Q1, ans);
    expect(r.pointsEarned).toBe(0);
    expect(r.tf?.correctCount).toBe(0);
  });

  it('trả đúng questionId và questionType', () => {
    const r = scoreTFQuestion(TF_Q1, undefined);
    expect(r.questionId).toBe('tf1');
    expect(r.questionType).toBe('true_false');
  });
});

// ============================================================================
// === scoreMCQSection ========================================================
// ============================================================================

describe('scoreMCQSection', () => {
  it('cả 2 câu đúng → score = 0.5', () => {
    const answers = {
      q1: { questionId: 'q1', questionType: 'mcq', selected: 'A' } as MCQAnswer,
      q2: { questionId: 'q2', questionType: 'mcq', selected: 'C' } as MCQAnswer,
    };
    const r = scoreMCQSection(MCQ_SECTION, answers);
    expect(r.score).toBe(0.5);
    expect(r.details).toHaveLength(2);
    expect(r.details.every((d) => d.isCorrect)).toBe(true);
  });

  it('1 đúng 1 sai → score = 0.25', () => {
    const answers = {
      q1: { questionId: 'q1', questionType: 'mcq', selected: 'A' } as MCQAnswer,
      q2: { questionId: 'q2', questionType: 'mcq', selected: 'B' } as MCQAnswer, // sai (đúng là C)
    };
    const r = scoreMCQSection(MCQ_SECTION, answers);
    expect(r.score).toBe(0.25);
  });

  it('không có câu trả lời → score = 0', () => {
    const r = scoreMCQSection(MCQ_SECTION, {});
    expect(r.score).toBe(0);
  });

  it('maxScore lấy từ section, không tính lại', () => {
    const r = scoreMCQSection(MCQ_SECTION, {});
    expect(r.maxScore).toBe(MCQ_SECTION.maxScore);
  });
});

// ============================================================================
// === scoreTFSection =========================================================
// ============================================================================

describe('scoreTFSection', () => {
  it('cả 2 câu đúng 4 ý → score = 2.0', () => {
    const allCorrect: TFAnswer = {
      questionId: '',
      questionType: 'true_false',
      selected: { a: true, b: false, c: true, d: false },
    };
    const answers = {
      tf1: { ...allCorrect, questionId: 'tf1' },
      tf2: { ...allCorrect, questionId: 'tf2' },
    };
    const r = scoreTFSection(TF_SECTION, answers);
    expect(r.score).toBe(2.0);
  });

  it('1 câu đúng 4 ý + 1 câu đúng 2 ý → score = 1.0 + 0.25 = 1.25', () => {
    const allCorrect: TFAnswer = {
      questionId: 'tf1',
      questionType: 'true_false',
      selected: { a: true, b: false, c: true, d: false },
    };
    const twoCorrect: TFAnswer = {
      questionId: 'tf2',
      questionType: 'true_false',
      selected: { a: true, b: false, c: false, d: true }, // a, b đúng
    };
    const r = scoreTFSection(TF_SECTION, { tf1: allCorrect, tf2: twoCorrect });
    expect(r.score).toBe(1.25);
  });
});

// ============================================================================
// === scoreSession ===========================================================
// ============================================================================

describe('scoreSession', () => {
  it('MCQ đúng + TF 4 ý đúng → totalScore=1.25', () => {
    const session = makeSession({
      q1: { questionId: 'q1', questionType: 'mcq', selected: 'A' },
      tf1: {
        questionId: 'tf1',
        questionType: 'true_false',
        selected: { a: true, b: false, c: true, d: false },
      },
    });
    const result = scoreSession(session, EXAM_FILE);
    expect(result.mcqScore).toBe(MCQ_SCORE_PER_QUESTION);
    expect(result.tfScore).toBe(1.0);
    expect(result.totalScore).toBe(1.25);
    expect(result.correctMCQ).toBe(1);
    expect(result.wrongMCQ).toBe(0);
    expect(result.blankMCQ).toBe(0);
    expect(result.tfBreakdown[4]).toBe(1); // 1 câu đúng 4 ý
  });

  it('MCQ sai + TF bỏ trống → totalScore=0', () => {
    const session = makeSession({
      q1: { questionId: 'q1', questionType: 'mcq', selected: 'D' }, // sai
      tf1: {
        questionId: 'tf1',
        questionType: 'true_false',
        selected: { a: null, b: null, c: null, d: null },
      },
    });
    const result = scoreSession(session, EXAM_FILE);
    expect(result.totalScore).toBe(0);
    expect(result.wrongMCQ).toBe(1);
    expect(result.tfBreakdown[0]).toBe(1); // 1 câu đúng 0 ý
  });

  it('không có câu trả lời → totalScore=0, blankMCQ=1', () => {
    const session = makeSession({});
    const result = scoreSession(session, EXAM_FILE);
    expect(result.totalScore).toBe(0);
    expect(result.blankMCQ).toBe(1);
    expect(result.totalQuestions).toBe(2);
  });

  it('durationSeconds tính từ submittedAt - startedAt khi submittedAt có', () => {
    const session = makeSession({}, { submittedAt: 3000 }); // startedAt=0
    session.startedAt = 1000;
    session.submittedAt = 4000;
    const result = scoreSession(session, EXAM_FILE);
    expect(result.durationSeconds).toBe(3); // (4000-1000)/1000 = 3s
  });

  it('durationSeconds fallback về session.durationSeconds khi không có submittedAt', () => {
    const session = makeSession({}, { durationSeconds: 2700 });
    delete session.submittedAt;
    const result = scoreSession(session, EXAM_FILE);
    expect(result.durationSeconds).toBe(2700);
  });

  it('sessionId và examId được copy sang result', () => {
    const session = makeSession({});
    const result = scoreSession(session, EXAM_FILE);
    expect(result.sessionId).toBe('sess-test');
    expect(result.examId).toBe('exam-test-001');
  });
});

// ============================================================================
// === Utility functions ======================================================
// ============================================================================

describe('roundScore', () => {
  it('làm tròn float imprecision', () => {
    // 0.1 + 0.2 = 0.30000000000000004 trong IEEE 754
    expect(roundScore(0.1 + 0.2)).toBe(0.3);
    // 0.1 * 3 = 0.30000000000000004 trong IEEE 754
    expect(roundScore(0.1 * 3)).toBe(0.3);
    // 0.5 + 0.25 + 0.1 = 0.8500000000000001
    expect(roundScore(0.5 + 0.25 + 0.1)).toBe(0.85);
  });

  it('giá trị nguyên không thay đổi', () => {
    expect(roundScore(6)).toBe(6);
    expect(roundScore(10)).toBe(10);
    expect(roundScore(0)).toBe(0);
  });
});

describe('scoreToPercent', () => {
  it('10/10 → 100.0%', () => expect(scoreToPercent(10, 10)).toBe(100));
  it('7.5/10 → 75.0%', () => expect(scoreToPercent(7.5, 10)).toBe(75));
  it('0/10 → 0%', () => expect(scoreToPercent(0, 10)).toBe(0));
  it('maxScore=0 → 0 (tránh div/0)', () => expect(scoreToPercent(5, 0)).toBe(0));
  it('default maxScore=10', () => expect(scoreToPercent(5)).toBe(50));
});

describe('rateScore', () => {
  it('≥ 8 → gioi', () => {
    expect(rateScore(10)).toBe('gioi');
    expect(rateScore(8)).toBe('gioi');
    expect(rateScore(8.5)).toBe('gioi');
  });

  it('6.5 – 7.9 → kha', () => {
    expect(rateScore(7.5)).toBe('kha');
    expect(rateScore(6.5)).toBe('kha');
    expect(rateScore(7.9)).toBe('kha');
  });

  it('5.0 – 6.4 → trung_binh', () => {
    expect(rateScore(5)).toBe('trung_binh');
    expect(rateScore(6)).toBe('trung_binh');
    expect(rateScore(6.4)).toBe('trung_binh');
  });

  it('< 5 → yeu', () => {
    expect(rateScore(4.9)).toBe('yeu');
    expect(rateScore(0)).toBe('yeu');
  });
});
