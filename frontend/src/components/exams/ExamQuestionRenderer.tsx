import { isMCQQuestion, isTFQuestion, type MCQQuestion, type Question, type TFStatement } from '@/types/exam';
import MCQQuestionCardV2 from './MCQQuestionCardV2';
import TFQuestionCard from './TFQuestionCard';

type MCQChoice = MCQQuestion['options'][number]['id'];
type TFChoice = Record<TFStatement['id'], boolean | null>;

interface ExamQuestionRendererProps {
  question: Question;
  index: number;
  total: number;
  selectedMCQ: MCQChoice | null;
  selectedTF: TFChoice;
  onMCQSelect: (optionId: MCQChoice) => void;
  onTFSelect: (statementId: TFStatement['id'], value: boolean | null) => void;
}

export default function ExamQuestionRenderer({
  question,
  index,
  total,
  selectedMCQ,
  selectedTF,
  onMCQSelect,
  onTFSelect,
}: ExamQuestionRendererProps) {
  if (isMCQQuestion(question)) {
    return (
      <MCQQuestionCardV2
        question={question}
        index={index}
        total={total}
        selectedOptionId={selectedMCQ}
        onSelectOption={onMCQSelect}
        showLearningMetadata={false}
        showSource={false}
      />
    );
  }

  if (isTFQuestion(question)) {
    return (
      <TFQuestionCard
        question={question}
        index={index}
        total={total}
        selected={selectedTF}
        onSelect={onTFSelect}
        showSource={false}
      />
    );
  }

  return null;
}
