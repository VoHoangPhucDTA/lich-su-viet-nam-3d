import type { ReactNode, RefObject } from 'react';
import QuizInstructionsDialog from '../quiz-runner/QuizInstructionsDialog';
import type { QuizShortcutItem } from '../../lib/exam/quizKeyboardShortcuts';

export type ExamShortcutItem = QuizShortcutItem;

interface ExamShortcutHelpProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  shortcuts: ExamShortcutItem[];
  title?: string;
  description?: ReactNode;
  notes?: ReactNode;
}

export default function ExamShortcutHelp(props: ExamShortcutHelpProps) {
  return <QuizInstructionsDialog {...props} />;
}
