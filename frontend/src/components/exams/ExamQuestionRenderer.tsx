import { type MCQQuestion, type Question, type TFStatement } from '@/types/exam';
import type { SafeQuestion } from '@/types/examApi';
import MCQQuestionCardV2 from './MCQQuestionCardV2';
import TFQuestionCard from './TFQuestionCard';

type MCQChoice = MCQQuestion['options'][number]['id'];
type TFChoice = Record<TFStatement['id'], boolean | null>;

interface ExamQuestionRendererProps {
  question: Question | SafeQuestion;
  index: number;
  total: number;
  selectedMCQ: MCQChoice | null;
  selectedTF: TFChoice;
  onMCQSelect: (optionId: MCQChoice) => void;
  onTFSelect: (statementId: TFStatement['id'], value: boolean | null) => void;
  disabled?: boolean;
}

export default function ExamQuestionRenderer({
  question,
  index,
  total,
  selectedMCQ,
  selectedTF,
  onMCQSelect,
  onTFSelect,
  disabled = false,
}: ExamQuestionRendererProps) {
  if (question.questionType === 'mcq') {
    return (
      <MCQQuestionCardV2
        question={question}
        index={index}
        total={total}
        selectedOptionId={selectedMCQ}
        onSelectOption={onMCQSelect}
        disabled={disabled}
        showLearningMetadata={false}
        showSource={false}
      />
    );
  }

  if (question.questionType === 'true_false') {
    return (
      <TFQuestionCard
        question={question}
        index={index}
        total={total}
        selected={selectedTF}
        onSelect={onTFSelect}
        disabled={disabled}
        showSource={false}
      />
    );
  }

  return null;
}
