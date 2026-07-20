import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface MuseumSelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface MuseumSelectProps<T extends string = string> {
  value: T;
  options: MuseumSelectOption<T>[];
  onValueChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function MuseumSelect<T extends string = string>({
  value,
  options,
  onValueChange,
  label,
  disabled = false,
  className = '',
}: MuseumSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePointer);
    return () => document.removeEventListener('mousedown', closeOnOutsidePointer);
  }, [open, selectedIndex]);

  const selectAt = (index: number) => {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    setOpen(false);
  };

  const moveFocus = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(options.length - 1, nextIndex));
    setActiveIndex(bounded);
    optionRefs.current[bounded]?.focus();
  };

  return (
    <div ref={rootRef} className={`museum-select ${className}`}>
      <button
        type="button"
        className="museum-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => {
          if (!open) setActiveIndex(selectedIndex);
          setOpen(current => !current);
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(selectedIndex);
            setOpen(true);
          }
        }}
      >
        <span className="truncate">{selected?.label ?? label}</span>
        <ChevronDown size={15} aria-hidden="true" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div id={listboxId} className="museum-select-menu" role="listbox" aria-label={label}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                ref={node => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={index === activeIndex ? 0 : -1}
                className={`museum-select-option ${isSelected ? 'museum-select-option-selected' : ''}`}
                onClick={() => selectAt(index)}
                onKeyDown={event => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveFocus((index + 1) % options.length);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveFocus((index - 1 + options.length) % options.length);
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    moveFocus(0);
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    moveFocus(options.length - 1);
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectAt(index);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpen(false);
                  } else if (event.key === 'Tab') {
                    setOpen(false);
                  }
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
