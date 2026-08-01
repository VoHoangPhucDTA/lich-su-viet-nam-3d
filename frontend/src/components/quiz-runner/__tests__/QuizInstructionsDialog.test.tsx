import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuizInstructionsDialog from '../QuizInstructionsDialog';

describe('QuizInstructionsDialog', () => {
  it('is modal, presents actual shortcuts, closes with Escape and restores trigger focus', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const triggerRef = createRef<HTMLButtonElement>();
    const trigger = document.createElement('button');
    triggerRef.current = trigger;
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { rerender } = render(
      <QuizInstructionsDialog
        id="instructions"
        isOpen
        onClose={onClose}
        triggerRef={triggerRef}
        shortcuts={[{ keyLabel: '?', description: 'Mở hướng dẫn làm bài' }]}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Hướng dẫn làm bài' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Mở hướng dẫn làm bài')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng hướng dẫn phím tắt' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <QuizInstructionsDialog
        id="instructions"
        isOpen={false}
        onClose={onClose}
        triggerRef={triggerRef}
        shortcuts={[]}
      />,
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
