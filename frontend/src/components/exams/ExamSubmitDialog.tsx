import QuizSubmitDialog from '../quiz-runner/QuizSubmitDialog';

interface ExamSubmitDialogProps {
  unansweredCount?: number;
  answeredCount?: number;
  totalQuestions?: number;
  completedCount?: number;
  partialCount?: number;
  untouchedCount?: number;
  flaggedCount?: number;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ExamSubmitDialog({
  unansweredCount,
  answeredCount,
  totalQuestions,
  completedCount,
  partialCount = 0,
  untouchedCount,
  flaggedCount = 0,
  isOpen,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: ExamSubmitDialogProps) {
  const unanswered = Math.max(0, unansweredCount ?? untouchedCount ?? 0);
  const total = Math.max(0, totalQuestions ?? (completedCount ?? answeredCount ?? 0) + partialCount + unanswered);
  const completed = Math.max(0, completedCount ?? answeredCount ?? total - partialCount - unanswered);

  return (
    <QuizSubmitDialog
      isOpen={isOpen}
      summary={{ total, completed, partial: partialCount, unanswered, flagged: flaggedCount }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}
