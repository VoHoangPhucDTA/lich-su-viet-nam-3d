import {
  isMCQQuestion,
  type AnswerEntry,
  type Question,
} from '@/types/exam';

export type QuestionDerivedState = {
  hasAnyAnswer: boolean;
  isComplete: boolean;
  answeredUnitCount: number;
  totalUnitCount: number;
  isFlagged: boolean;
  isCurrent: boolean;
};

export function deriveQuestionState(
  question: Question,
  answer: AnswerEntry | undefined,
  isFlagged: boolean,
  isCurrent: boolean,
): QuestionDerivedState {
  if (isMCQQuestion(question)) {
    const hasAnyAnswer = answer?.questionType === 'mcq' && answer.selected !== null;
    return {
      hasAnyAnswer,
      isComplete: hasAnyAnswer,
      answeredUnitCount: hasAnyAnswer ? 1 : 0,
      totalUnitCount: 1,
      isFlagged,
      isCurrent,
    };
  }

  const selected = answer?.questionType === 'true_false' ? answer.selected : undefined;
  const answeredUnitCount = question.statements.filter((statement) => selected?.[statement.id] != null).length;
  const totalUnitCount = question.statements.length;

  return {
    hasAnyAnswer: answeredUnitCount > 0,
    isComplete: totalUnitCount > 0 && answeredUnitCount === totalUnitCount,
    answeredUnitCount,
    totalUnitCount,
    isFlagged,
    isCurrent,
  };
}
