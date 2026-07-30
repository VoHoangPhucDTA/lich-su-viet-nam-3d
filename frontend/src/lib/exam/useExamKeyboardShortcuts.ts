import { useEffect, useRef } from 'react';

interface ExamKeyboardShortcutsOptions {
  onNext?: () => void;
  onPrevious?: () => void;
  onFlag?: () => void;
  onShowHelp?: () => void;
  onCheck?: () => void;
  onSelectOptionByIndex?: (index: number) => void;
  onMoveOption?: (direction: -1 | 1) => void;
  onClearOption?: () => void;
  onSubmit?: () => void;
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
  onMoveOption,
  onClearOption,
  onSubmit,
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
      onMoveOption,
      onClearOption,
      onSubmit,
      mode,
      disabled,
    };
  }, [
    disabled,
    mode,
    onCheck,
    onClearOption,
    onFlag,
    onMoveOption,
    onNext,
    onPrevious,
    onSelectOptionByIndex,
    onShowHelp,
    onSubmit,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const {
        onNext,
        onPrevious,
        onFlag,
        onShowHelp,
        onCheck,
        onSelectOptionByIndex,
        onMoveOption,
        onClearOption,
        onSubmit,
        mode,
        disabled,
      } = handlersRef.current;
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
        } else if (event.key === 'Enter' && mode === 'timed' && onSubmit) {
          event.preventDefault();
          onSubmit();
        }
        return;
      }

      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && onMoveOption) {
        event.preventDefault();
        event.stopPropagation();
        onMoveOption(event.key === 'ArrowUp' ? -1 : 1);
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

      if ((event.key === 'Home' || event.key === 'End') && onSelectOptionByIndex) {
        event.preventDefault();
        onSelectOptionByIndex(event.key === 'Home' ? 0 : 3);
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && onClearOption) {
        event.preventDefault();
        onClearOption();
        return;
      }

      if (!event.shiftKey && /^[1-4]$/.test(event.key) && onSelectOptionByIndex) {
        event.preventDefault();
        onSelectOptionByIndex(Number(event.key) - 1);
        return;
      }

      if (/^[a-d]$/i.test(event.key) && onSelectOptionByIndex) {
        event.preventDefault();
        onSelectOptionByIndex(event.key.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0));
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
