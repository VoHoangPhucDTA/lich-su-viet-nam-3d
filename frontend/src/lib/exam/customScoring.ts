import {
  isMCQQuestion,
  isTFQuestion,
  type CustomExamSession,
  type ExamResultV2,
  type MCQAnswer,
  type QuestionResult,
  type TFAnswer,
} from '@/types/exam';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreCustomMockSession(session: CustomExamSession): ExamResultV2 {
  const answers = session.practiceState?.answers ?? {};
  const questions = session.questionSnapshots ?? [];
  const questionResults: QuestionResult[] = [];
  let achievedUnits = 0;
  let mcqUnits = 0;
  let tfUnits = 0;
  let correctMCQ = 0;
  let wrongMCQ = 0;
  let blankMCQ = 0;
  const tfBreakdown: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  for (const question of questions) {
    const answer = answers[question.id];

    if (isMCQQuestion(question)) {
      const selected = answer?.questionType === 'mcq' ? (answer as MCQAnswer).selected : null;
      const isCorrect = selected === question.correctOptionId;
      const pointsEarned = isCorrect ? 1 : 0;
      achievedUnits += pointsEarned;
      mcqUnits += pointsEarned;
      if (selected == null) blankMCQ += 1;
      else if (isCorrect) correctMCQ += 1;
      else wrongMCQ += 1;
      questionResults.push({
        questionId: question.id,
        questionType: 'mcq',
        isCorrect,
        pointsEarned,
        mcq: {
          selected,
          correct: question.correctOptionId,
        },
      });
      continue;
    }

    if (isTFQuestion(question)) {
      const selected = answer?.questionType === 'true_false'
        ? (answer as TFAnswer).selected
        : { a: null, b: null, c: null, d: null };
      const correct = { a: false, b: false, c: false, d: false };
      let correctCount = 0;
      for (const statement of question.statements) {
        correct[statement.id] = statement.isTrue;
        if (selected[statement.id] === statement.isTrue) correctCount += 1;
      }
      const statementCount = Math.max(question.statements.length, 1);
      const pointsEarned = correctCount / statementCount;
      achievedUnits += pointsEarned;
      tfUnits += pointsEarned;
      tfBreakdown[Math.min(correctCount, 4)] += 1;
      questionResults.push({
        questionId: question.id,
        questionType: 'true_false',
        isCorrect: correctCount === question.statements.length,
        pointsEarned,
        tf: {
          selected,
          correct,
          correctCount,
        },
      });
    }
  }

  const maxUnits = Math.max(questions.length, 1);
  const submittedAt = session.submittedAt ?? Date.now();
  const startedAt = session.startedAt ?? submittedAt;
  const durationSeconds = Math.max(0, Math.floor((submittedAt - startedAt) / 1000));
  const totalScore = round2((achievedUnits / maxUnits) * 10);

  return {
    sessionId: session.sessionId,
    mode: 'custom_mock',
    title: session.title,
    isCustom: true,
    sourceExamIds: session.sourceExamIds,
    questionSnapshots: session.questionSnapshots,
    answers,
    config: session.config,
    maxScore: 10,
    score: totalScore,
    totalScore,
    mcqScore: round2((mcqUnits / maxUnits) * 10),
    tfScore: round2((tfUnits / maxUnits) * 10),
    totalQuestions: questions.length,
    correctMCQ,
    wrongMCQ,
    blankMCQ,
    tfBreakdown,
    durationSeconds,
    submittedAt,
    questions: questionResults,
    userId: undefined,
  };
}
