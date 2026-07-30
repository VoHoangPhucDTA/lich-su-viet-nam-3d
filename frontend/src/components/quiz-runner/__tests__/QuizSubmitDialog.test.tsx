import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuizSubmitDialog from '../QuizSubmitDialog';

describe('QuizSubmitDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not render while closed', () => {
    render(
      <QuizSubmitDialog
        isOpen={false}
        summary={{ total: 5, completed: 4, unanswered: 1 }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('focuses cancel, exposes the summary, traps focus, closes on Escape and restores focus', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onCancel = vi.fn();
    const { rerender } = render(
      <QuizSubmitDialog
        isOpen
        summary={{ total: 5, completed: 3, unanswered: 2, flagged: 1 }}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /xác nhận nộp bài/i });
    const cancel = screen.getByRole('button', { name: /quay lại làm tiếp/i });
    const confirm = screen.getByRole('button', { name: /xác nhận nộp/i });
    expect(cancel).toHaveFocus();
    expect(within(dialog).getAllByRole('definition').map((node) => node.textContent)).toEqual(['5', '3', '0', '2', '1']);

    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    rerender(
      <QuizSubmitDialog
        isOpen={false}
        summary={{ total: 5, completed: 3, unanswered: 2 }}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('closes on backdrop and guards duplicate confirm while busy', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container, rerender } = render(
      <QuizSubmitDialog
        isOpen
        summary={{ total: 3, completed: 3, unanswered: 0 }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.mouseDown(container.firstElementChild as Element);
    expect(onCancel).toHaveBeenCalledOnce();
    const confirm = screen.getByRole('button', { name: /xác nhận nộp/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(
      <QuizSubmitDialog
        isOpen
        isSubmitting
        summary={{ total: 3, completed: 3, unanswered: 0 }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('button', { name: /đang nộp/i })).toBeDisabled();
  });
});
