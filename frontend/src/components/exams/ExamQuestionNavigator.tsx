import type { QuestionDerivedState } from '@/lib/exam/questionState';
import type { Question } from '@/types/exam';
import type { CSSProperties } from 'react';

interface ExamQuestionNavigatorProps {
  questions: Question[];
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
  const mcqCount = questions.filter((question) => question.questionType === 'mcq').length;

  return (
    <div className="exam-question-navigator">
      <NavigatorSection
        label="Phần I - Trắc nghiệm"
        indexes={Array.from({ length: mcqCount }, (_, index) => index)}
        questions={questions}
        questionStates={questionStates}
        currentIndex={currentIndex}
        onQuestionSelect={onQuestionSelect}
      />
      <NavigatorSection
        label="Phần II - Đúng/Sai"
        indexes={Array.from({ length: questions.length - mcqCount }, (_, index) => mcqCount + index)}
        questions={questions}
        questionStates={questionStates}
        currentIndex={currentIndex}
        onQuestionSelect={onQuestionSelect}
        compact
      />
      <div className="exam-question-navigator-legend">
        <LegendItem color="var(--exam-selection)" label="Đã hoàn thành" />
        <LegendItem color="var(--exam-warning)" label="Đang làm dở" />
        <LegendItem color="var(--exam-warning)" label="Xem lại sau" />
        <LegendItem color="var(--border)" label="Chưa làm" />
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
  questions: Question[];
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
              {state?.isFlagged && <span aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div>
      <span aria-hidden="true" style={{ '--navigator-color': color } as CSSProperties} />
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
