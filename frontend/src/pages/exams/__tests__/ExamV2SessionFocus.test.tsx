import { useCallback, useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExamAnswerSheet from '@/components/exams/ExamAnswerSheet';
import { useQuestionNavigation } from '@/lib/exam/useQuestionNavigation';

function TimedSheetHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const closeReasonRef = useRef<'dismiss' | 'select-question'>('dismiss');
  const getCloseReason = useCallback(() => closeReasonRef.current, []);
  const navigate = useQuestionNavigation({ questionCount: 2, onIndexChange: vi.fn(), questionRef });
  return <>
    <div ref={questionRef} tabIndex={-1} data-exam-current-question>Question</div>
    <button ref={triggerRef} onClick={() => { closeReasonRef.current = 'dismiss'; setOpen(true); }}>Phiếu trả lời</button>
    <ExamAnswerSheet id="timed-sheet" isOpen={open} triggerRef={triggerRef} getCloseReason={getCloseReason} onClose={() => { closeReasonRef.current = 'dismiss'; setOpen(false); }}>
      <button onClick={() => { closeReasonRef.current = 'select-question'; setOpen(false); navigate(1); }}>Câu 2</button>
    </ExamAnswerSheet>
  </>;
}

describe('timed answer sheet focus integration', () => {
  it('focuses the question after selecting and restores trigger after dismiss', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    Element.prototype.scrollIntoView = vi.fn();
    render(<TimedSheetHarness />);
    const trigger = screen.getByRole('button', { name: 'Phiếu trả lời' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Câu 2' }));
    expect(document.activeElement).toBe(screen.getByText('Question'));
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});
