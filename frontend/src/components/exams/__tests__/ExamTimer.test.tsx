import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExamTimer from '../ExamTimer';

afterEach(() => vi.useRealTimers());

function renderAt(seconds: number) {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const onTimeUp = vi.fn();
  render(<ExamTimer deadlineMs={1_000_000 + seconds * 1000} onTimeUp={onTimeUp} />);
  return { status: screen.getByRole('status'), onTimeUp };
}

describe('ExamTimer announcements', () => {
  it('does not announce an already-passed five-minute milestone on resume', () => {
    const { status } = renderAt(120);
    expect(status).toHaveTextContent('');
  });

  it.each([
    [301, 'Còn 5 phút'],
    [61, 'Còn 1 phút'],
  ])('announces a milestone once when crossing from %i seconds', (seconds, message) => {
    const { status } = renderAt(seconds);
    act(() => vi.advanceTimersByTime(1000));
    expect(status).toHaveTextContent(message);
    act(() => vi.advanceTimersByTime(1000));
    expect(status).toHaveTextContent(message);
  });

  it('announces and submits once when crossing zero', () => {
    const { status, onTimeUp } = renderAt(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(status).toHaveTextContent('Đã hết giờ');
    expect(onTimeUp).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(3000));
    expect(onTimeUp).toHaveBeenCalledOnce();
  });
});
