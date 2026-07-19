import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExamSubmitDialog from '../ExamSubmitDialog';

describe('ExamSubmitDialog', () => {
  it('renders semantic counts and handles cancel and confirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ExamSubmitDialog isOpen totalQuestions={28} completedCount={20} partialCount={3} untouchedCount={5} flaggedCount={2} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    const dialog = screen.getByRole('dialog', { name: /xác nhận nộp bài/i });
    expect(within(dialog).getAllByRole('term')).toHaveLength(5);
    expect(within(dialog).getAllByRole('definition').map((node) => node.textContent)).toEqual(['28', '20', '3', '5', '2']);
    fireEvent.click(screen.getByRole('button', { name: /quay lại làm tiếp/i }));
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(<ExamSubmitDialog isOpen totalQuestions={28} completedCount={28} onCancel={onCancel} onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: /xác nhận nộp/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('keeps large counts aligned in the same five semantic fields', () => {
    render(<ExamSubmitDialog isOpen totalQuestions={100} completedCount={98} partialCount={1} untouchedCount={1} flaggedCount={12} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('definition').map((node) => node.textContent)).toEqual(['100', '98', '1', '1', '12']);
  });
});
