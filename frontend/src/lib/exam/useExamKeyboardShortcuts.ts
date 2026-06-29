import { useEffect, useRef } from 'react';

interface ExamKeyboardShortcutsOptions {
  onNext?: () => void;
  onPrevious?: () => void;
  onEnter?: () => void;
  onFlag?: () => void;
  disabled?: boolean;
}

function getShortcutTarget(event: KeyboardEvent): HTMLElement | null {
  if (event.target instanceof HTMLElement) return event.target;
  if (document.activeElement instanceof HTMLElement) return document.activeElement;
  return null;
}

function isTextEditingTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function isActivationTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'button' || tagName === 'a' || Boolean(target.closest('button,a'));
}

export function useExamKeyboardShortcuts({
  onNext,
  onPrevious,
  onEnter,
  onFlag,
  disabled = false,
}: ExamKeyboardShortcutsOptions) {
  const handlersRef = useRef<ExamKeyboardShortcutsOptions>({
    disabled: true,
  });

  useEffect(() => {
    handlersRef.current = {
      onNext,
      onPrevious,
      onEnter,
      onFlag,
      disabled,
    };
  }, [disabled, onEnter, onFlag, onNext, onPrevious]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const { onNext, onPrevious, onEnter, onFlag, disabled } = handlersRef.current;
      if (disabled) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.repeat) return;
      if (event.isComposing) return;

      const target = getShortcutTarget(event);
      if (isTextEditingTarget(target)) return;

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

      if (event.key === 'Enter' && onEnter) {
        if (isActivationTarget(target)) return;
        event.preventDefault();
        onEnter();
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
