import { useRef, type CSSProperties, type KeyboardEvent } from 'react';

export interface QuizMcqOption {
  id: 'A' | 'B' | 'C' | 'D';
  label: string;
}

interface QuizMcqOptionGroupProps {
  options: QuizMcqOption[];
  selected: QuizMcqOption['id'] | null;
  onSelect: (id: QuizMcqOption['id']) => void;
  disabled?: boolean;
  labelledBy?: string;
  ariaLabel?: string;
  className?: string;
  optionClassName?: (option: QuizMcqOption, selected: boolean) => string;
  optionStyle?: (option: QuizMcqOption, selected: boolean) => CSSProperties;
  renderOption?: (option: QuizMcqOption, selected: boolean) => React.ReactNode;
}

export default function QuizMcqOptionGroup({
  options,
  selected,
  onSelect,
  disabled = false,
  labelledBy,
  ariaLabel,
  className,
  optionClassName,
  optionStyle,
  renderOption,
}: QuizMcqOptionGroupProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.id === selected);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function selectAndFocus(index: number) {
    if (disabled || options.length === 0) return;
    const normalizedIndex = (index + options.length) % options.length;
    const next = options[normalizedIndex];
    if (!next) return;
    onSelect(next.id);
    optionRefs.current[normalizedIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (disabled) return;
    const key = event.key;
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === 'Home') selectAndFocus(0);
    else if (key === 'End') selectAndFocus(options.length - 1);
    else if (key === 'ArrowDown' || key === 'ArrowRight') selectAndFocus(index + 1);
    else if (key === 'ArrowUp' || key === 'ArrowLeft') selectAndFocus(index - 1);
    else {
      const option = options[index];
      if (option) onSelect(option.id);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-orientation="vertical"
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      className={className}
    >
      {options.map((option, index) => {
        const isSelected = selected === option.id;
        return (
          <button
            key={option.id}
            ref={(node) => { optionRefs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${option.id}: ${option.label}`}
            disabled={disabled}
            tabIndex={disabled ? -1 : index === activeIndex ? 0 : -1}
            onClick={() => onSelect(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={optionClassName?.(option, isSelected)}
            style={optionStyle?.(option, isSelected)}
          >
            {renderOption ? renderOption(option, isSelected) : option.label}
          </button>
        );
      })}
    </div>
  );
}
