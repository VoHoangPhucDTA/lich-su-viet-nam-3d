import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExamAnswerSheet from '../ExamAnswerSheet';

describe('ExamAnswerSheet focus', () => {
  it('restores the trigger when dismissed', () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const closeReasonRef = { current: 'dismiss' as const };
    const trigger = document.createElement('button');
    document.body.append(trigger);
    Object.defineProperty(triggerRef, 'current', { value: trigger });
    const focus = vi.spyOn(trigger, 'focus');
    const { rerender } = render(
      <ExamAnswerSheet id="sheet" isOpen onClose={vi.fn()} triggerRef={triggerRef} getCloseReason={() => closeReasonRef.current}><button>Question 2</button></ExamAnswerSheet>,
    );
    rerender(<ExamAnswerSheet id="sheet" isOpen={false} onClose={vi.fn()} triggerRef={triggerRef} getCloseReason={() => closeReasonRef.current}><button>Question 2</button></ExamAnswerSheet>);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('leaves focus for the question anchor after selecting a question', () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const closeReasonRef = { current: 'select-question' as const };
    const trigger = document.createElement('button');
    document.body.append(trigger);
    Object.defineProperty(triggerRef, 'current', { value: trigger });
    const focus = vi.spyOn(trigger, 'focus');
    const { rerender } = render(
      <ExamAnswerSheet id="sheet" isOpen onClose={vi.fn()} triggerRef={triggerRef} getCloseReason={() => closeReasonRef.current}><button>Question 2</button></ExamAnswerSheet>,
    );
    rerender(<ExamAnswerSheet id="sheet" isOpen={false} onClose={vi.fn()} triggerRef={triggerRef} getCloseReason={() => closeReasonRef.current}><button>Question 2</button></ExamAnswerSheet>);
    expect(focus).not.toHaveBeenCalled();
  });
});
