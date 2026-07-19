import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clampQuestionIndex, useQuestionNavigation } from '../useQuestionNavigation';

function Harness({ onIndexChange }: { onIndexChange: (index: number) => void }) {
  const questionRef = useRef<HTMLDivElement>(null);
  const [answer, setAnswer] = useState('');
  const navigate = useQuestionNavigation({ questionCount: 3, onIndexChange, questionRef });
  return <>
    <div ref={questionRef} tabIndex={-1}>Question</div>
    <button onClick={() => navigate(8)}>Navigate</button>
    <button onClick={() => setAnswer('A')}>Answer {answer}</button>
  </>;
}

describe('question navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    Element.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.focus = vi.fn();
  });

  it('clamps indexes', () => {
    expect(clampQuestionIndex(-1, 3)).toBe(0);
    expect(clampQuestionIndex(8, 3)).toBe(2);
    expect(clampQuestionIndex(0, 0)).toBe(0);
  });

  it('updates, scrolls, and focuses only on navigation', () => {
    const onIndexChange = vi.fn();
    render(<Harness onIndexChange={onIndexChange} />);
    fireEvent.click(screen.getByRole('button', { name: /answer/i }));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /navigate/i }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    expect(HTMLElement.prototype.focus).toHaveBeenCalledOnce();
  });
});
