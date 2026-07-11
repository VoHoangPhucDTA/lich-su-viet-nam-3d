import type { KeyboardEvent } from 'react';

/** Handles roving focus and selection for a small button-based radio group. */
export function handleRadioGroupKeyDown<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  optionIds: readonly T[],
  currentId: T,
  onSelect: (id: T) => void,
  disabled = false,
): void {
  if (disabled) return;
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
  if (!keys.includes(event.key)) return;

  event.preventDefault();
  event.stopPropagation();
  const currentIndex = optionIds.indexOf(currentId);
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? optionIds.length - 1 :
    (currentIndex + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + optionIds.length) % optionIds.length;
  const nextId = optionIds[nextIndex];
  if (!nextId) return;
  onSelect(nextId);
  const group = event.currentTarget.closest<HTMLElement>('[role="radiogroup"]');
  group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
}
