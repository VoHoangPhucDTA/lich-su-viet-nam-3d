import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuizGenerationLoading from '../QuizGenerationLoading';

describe('QuizGenerationLoading', () => {
  it('uses one decorative hourglass and keeps stop-waiting semantics', () => {
    const onStopWaiting = vi.fn();
    const { container } = render(<QuizGenerationLoading questionCount={5} onStopWaiting={onStopWaiting} />);
    expect(screen.getByRole('dialog', { name: 'Đang tạo 5 câu hỏi từ nguồn SGK…' })).toBeInTheDocument();
    expect(container.querySelector('.lucide-hourglass')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dừng chờ' }));
    expect(onStopWaiting).toHaveBeenCalledOnce();
  });
});
