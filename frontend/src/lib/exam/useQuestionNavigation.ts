import { useCallback, type RefObject } from 'react';

interface QuestionNavigationOptions {
  questionCount: number;
  onIndexChange: (index: number) => void;
  questionRef: RefObject<HTMLElement | null>;
  beforeNavigate?: () => void;
}

export function clampQuestionIndex(index: number, questionCount: number): number {
  return Math.min(Math.max(index, 0), Math.max(questionCount - 1, 0));
}

export function useQuestionNavigation({ questionCount, onIndexChange, questionRef, beforeNavigate }: QuestionNavigationOptions) {
  return useCallback((index: number) => {
    const nextIndex = clampQuestionIndex(index, questionCount);
    beforeNavigate?.();
    onIndexChange(nextIndex);
    window.requestAnimationFrame(() => {
      const target = questionRef.current;
      if (!target) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      target.focus({ preventScroll: true });
    });
  }, [beforeNavigate, onIndexChange, questionCount, questionRef]);
}
