import type { LucideIcon } from 'lucide-react';

interface QuizSelectionCardProps {
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  compact?: boolean;
}

export default function QuizSelectionCard({
  title,
  description,
  selected,
  onClick,
  icon: Icon,
  compact = false,
}: QuizSelectionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`quiz-selection-card ${selected ? 'quiz-selection-card-selected' : ''} ${compact ? 'quiz-selection-card-compact' : ''}`}
    >
      {Icon && (
        <span className="quiz-selection-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 text-left">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
    </button>
  );
}
