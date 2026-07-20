import { formatExamExplanation } from '@/lib/exam/explanationFormat';

interface ExamExplanationTextProps {
  text: string;
}

export default function ExamExplanationText({ text }: ExamExplanationTextProps) {
  return <span style={{ whiteSpace: 'pre-line' }}>{formatExamExplanation(text)}</span>;
}
