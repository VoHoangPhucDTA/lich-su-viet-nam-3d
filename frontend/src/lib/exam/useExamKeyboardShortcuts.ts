import { useEffect, useRef } from 'react';

interface ExamKeyboardShortcutsOptions {
  onNext?: () => void;
  onPrevious?: () => void;
  onFlag?: () => void;
  onShowHelp?: () => void;
  disabled?: boolean;
}

function getShortcutTarget(event: KeyboardEvent): HTMLElement | null {
  if (event.target instanceof HTMLElement) return event.target;
  if (document.activeElement instanceof HTMLElement) return document.activeElement;
  return null;
}

function isInteractiveTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  return Boolean(target.closest(
    'button,a,input,select,textarea,[contenteditable="true"],[role="radio"],[role="button"],[role="dialog"]',
  ));
}

export function useExamKeyboardShortcuts({
  onNext,
  onPrevious,
  onFlag,
  onShowHelp,
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
      disabled,
    };
  }, [disabled, onFlag, onNext, onPrevious, onShowHelp]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const { onNext, onPrevious, onFlag, onShowHelp, disabled } = handlersRef.current;
      if (disabled) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.repeat) return;
      if (event.isComposing) return;

      const target = getShortcutTarget(event);
      if (isInteractiveTarget(target)) return;

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

      if (event.key.toLowerCase() === 'f' && onFlag) {
        event.preventDefault();
        onFlag();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
