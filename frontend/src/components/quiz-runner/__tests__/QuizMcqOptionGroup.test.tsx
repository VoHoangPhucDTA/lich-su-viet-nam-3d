import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuizMcqOptionGroup from '../QuizMcqOptionGroup';

const options = [
  { id: 'A' as const, label: 'Phương án A' },
  { id: 'B' as const, label: 'Phương án B' },
  { id: 'C' as const, label: 'Phương án C' },
  { id: 'D' as const, label: 'Phương án D' },
];

describe('QuizMcqOptionGroup', () => {
  it('uses radiogroup semantics and roving tabindex', () => {
    render(<QuizMcqOptionGroup options={options} selected="B" onSelect={vi.fn()} ariaLabel="Đáp án" />);
    expect(screen.getByRole('radiogroup', { name: 'Đáp án' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('tabindex', '0');
    expect(radios[0]).toHaveAttribute('tabindex', '-1');
  });

  it('selects by click, arrows, Home and End while moving focus', () => {
    const onSelect = vi.fn();
    render(<QuizMcqOptionGroup options={options} selected={null} onSelect={onSelect} ariaLabel="Đáp án" />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);
    expect(onSelect).toHaveBeenLastCalledWith('B');
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('B');
    expect(radios[1]).toHaveFocus();
    fireEvent.keyDown(radios[1], { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('D');
    expect(radios[3]).toHaveFocus();
    fireEvent.keyDown(radios[3], { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('A');
    expect(radios[0]).toHaveFocus();
  });

  it('does not select disabled options', () => {
    const onSelect = vi.fn();
    render(<QuizMcqOptionGroup options={options} selected={null} onSelect={onSelect} ariaLabel="Đáp án" disabled />);
    const first = screen.getAllByRole('radio')[0];
    fireEvent.click(first);
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(first).toBeDisabled();
  });
});
