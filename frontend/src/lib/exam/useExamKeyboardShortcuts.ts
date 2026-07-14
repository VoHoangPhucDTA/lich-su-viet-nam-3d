import { useEffect, useRef } from 'react';

interface ExamKeyboardShortcutsOptions {
  onNext?: () => void;
  onPrevious?: () => void;
  onFlag?: () => void;
  onShowHelp?: () => void;
  onCheck?: () => void;
  onSelectOptionByIndex?: (index: number) => void;
  mode?: 'timed' | 'practice';
  disabled?: boolean;
}

function getShortcutTarget(event: KeyboardEvent): HTMLElement | null {
  if (event.target instanceof HTMLElement) return event.target;
  if (document.activeElement instanceof HTMLElement) return document.activeElement;
  return null;
}

function isTypingTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  return Boolean(target.closest(
    'input,select,textarea,[contenteditable="true"]',
  ));
}

export function useExamKeyboardShortcuts({
  onNext,
  onPrevious,
  onFlag,
  onShowHelp,
  onCheck,
  onSelectOptionByIndex,
  mode = 'timed',
  disabled = false,
}: ExamKeyboardShortcutsOptions) {
  const handlersRef = useRef<ExamKeyboardShortcutsOptions>({
    disabled: true,
  });

  useEffect(() => {
    handlersRef.current = {
      onNext,
      onPrevious,
      onFlag,
      onShowHelp,
      onCheck,
      onSelectOptionByIndex,
      mode,
      disabled,
    };
  }, [disabled, mode, onCheck, onFlag, onNext, onPrevious, onSelectOptionByIndex, onShowHelp]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const { onNext, onPrevious, onFlag, onShowHelp, onCheck, onSelectOptionByIndex, mode, disabled } = handlersRef.current;
      if (disabled) return;
      if (event.altKey || event.metaKey) return;
      if (event.repeat) return;
      if (event.isComposing) return;

      const target = getShortcutTarget(event);
      if (isTypingTarget(target)) return;

      if (event.ctrlKey) {
        if (event.key === 'Enter' && mode === 'practice' && onCheck) {
          event.preventDefault();
          onCheck();
        }
        return;
      }

      if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
        return;
      }

      if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === '?' && onShowHelp) {
        event.preventDefault();
        onShowHelp();
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === 'f' && mode === 'timed' && onFlag) {
        event.preventDefault();
        onFlag();
        return;
      }

      if (!event.shiftKey && /^[1-4]$/.test(event.key) && onSelectOptionByIndex) {
        event.preventDefault();
        onSelectOptionByIndex(Number(event.key) - 1);
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
