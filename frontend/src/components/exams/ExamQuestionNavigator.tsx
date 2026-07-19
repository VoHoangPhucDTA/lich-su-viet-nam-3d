import type { QuestionDerivedState } from '@/lib/exam/questionState';
import type { QuestionType } from '@/types/exam';
import { Flag } from 'lucide-react';

interface ExamQuestionNavigatorProps {
  questions: Array<{ id: string; questionType: QuestionType }>;
  questionStates: Record<string, QuestionDerivedState>;
  currentIndex: number;
  onQuestionSelect: (index: number) => void;
}

export default function ExamQuestionNavigator({
  questions,
  questionStates,
  currentIndex,
  onQuestionSelect,
}: ExamQuestionNavigatorProps) {
  const indexedQuestions = questions.map((question, index) => ({ question, index }));
  const mcqIndexes = indexedQuestions.filter(({ question }) => question.questionType === 'mcq').map(({ index }) => index);
  const tfIndexes = indexedQuestions.filter(({ question }) => question.questionType === 'true_false').map(({ index }) => index);

  return (
    <div className="exam-question-navigator">
      <NavigatorSection
        label="Phần I - Trắc nghiệm"
        indexes={mcqIndexes}
        questions={questions}
        questionStates={questionStates}
        currentIndex={currentIndex}
        onQuestionSelect={onQuestionSelect}
      />
      <NavigatorSection
        label="Phần II - Đúng/Sai"
        indexes={tfIndexes}
        questions={questions}
        questionStates={questionStates}
        currentIndex={currentIndex}
        onQuestionSelect={onQuestionSelect}
        compact
      />
      <div className="exam-question-navigator-legend">
        <LegendItem state="complete" label="Đã hoàn thành" />
        <LegendItem state="partial" label="Đang làm dở" />
        <LegendItem state="flagged" label="Đánh dấu xem lại" />
        <LegendItem state="current" label="Đang xem" />
        <LegendItem state="untouched" label="Chưa làm" />
      </div>
    </div>
  );
}

function NavigatorSection({
  label,
  indexes,
  questions,
  questionStates,
  currentIndex,
  onQuestionSelect,
  compact = false,
}: {
  label: string;
  indexes: number[];
  questions: Array<{ id: string; questionType: QuestionType }>;
  questionStates: Record<string, QuestionDerivedState>;
  currentIndex: number;
  onQuestionSelect: (index: number) => void;
  compact?: boolean;
}) {
  return (
    <section className="exam-question-navigator-section">
      <div className="exam-question-navigator-label">{label}</div>
      <div className={`exam-question-navigator-grid${compact ? ' is-compact' : ''}`}>
        {indexes.map((index) => {
          const question = questions[index];
          if (!question) return null;
          const state = questionStates[question.id];
          const isCurrent = state?.isCurrent ?? index === currentIndex;
          return (
            <button
              key={question.id}
              type="button"
              aria-label={getQuestionAriaLabel(index, state)}
              aria-current={isCurrent ? 'step' : undefined}
              title={getQuestionAriaLabel(index, state)}
              className={`exam-focusable exam-question-navigator-button${state?.isComplete ? ' is-complete' : state?.hasAnyAnswer ? ' is-partial' : ''}`}
              onClick={() => onQuestionSelect(index)}
            >
              {index + 1}
              {state?.isFlagged && <Flag aria-hidden="true" className="exam-question-flag" size={10} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LegendItem({ state, label }: { state: 'complete' | 'partial' | 'flagged' | 'current' | 'untouched'; label: string }) {
  return (
    <div>
      <span aria-hidden="true" className={`exam-navigator-state-swatch is-${state}`}>
        {state === 'flagged' && <Flag size={9} />}
      </span>
      {label}
    </div>
  );
}

function getQuestionAriaLabel(index: number, state: QuestionDerivedState | undefined): string {
  if (!state) return `Câu ${index + 1}`;
  const details = [
    state.isCurrent ? 'đang xem' : null,
    state.isComplete
      ? 'đã hoàn thành'
      : state.hasAnyAnswer
        ? `đã trả lời ${state.answeredUnitCount} trên ${state.totalUnitCount} ý`
        : 'chưa làm',
    state.isFlagged ? 'đánh dấu xem lại' : null,
  ].filter(Boolean);
  return `Câu ${index + 1}, ${details.join(', ')}`;
}
