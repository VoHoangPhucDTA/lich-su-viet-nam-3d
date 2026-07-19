import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useExamKeyboardShortcuts } from '../useExamKeyboardShortcuts';
import { handleRadioGroupKeyDown } from '../radioGroupKeyboard';

function Harness(props: Parameters<typeof useExamKeyboardShortcuts>[0]) {
  useExamKeyboardShortcuts(props);
  return <>
    <input aria-label="search" />
    <select aria-label="filter"><option>All</option></select>
    <textarea aria-label="notes" />
    <div contentEditable aria-label="editor" />
    <a href="/back">Back</a>
    <button role="radio">A</button>
    <button aria-label="TF answer">True</button>
    <button aria-label="Check answer">Check</button>
    <button aria-label="Next question">Next</button>
  </>;
}

describe('exam keyboard shortcuts', () => {
  it('runs Left/Right and help while focus is on an answer', () => {
    const previous = vi.fn(), next = vi.fn(), help = vi.fn();
    const { getByRole } = render(<Harness onPrevious={previous} onNext={next} onShowHelp={help} />);
    const answer = getByRole('radio');
    fireEvent.keyDown(answer, { key: 'ArrowLeft' });
    fireEvent.keyDown(answer, { key: 'ArrowRight' });
    fireEvent.keyDown(answer, { key: '?' });
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(help).toHaveBeenCalledOnce();
  });

  it('maps number, Ctrl+Enter, and Shift+F by mode', () => {
    const select = vi.fn(), check = vi.fn(), flag = vi.fn();
    const practice = render(<Harness mode="practice" onSelectOptionByIndex={select} onCheck={check} onFlag={flag} />);
    fireEvent.keyDown(document.body, { key: '3' });
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'f' });
    expect(select).toHaveBeenCalledWith(2);
    expect(check).toHaveBeenCalledOnce();
    expect(flag).not.toHaveBeenCalled();
    practice.unmount();
    render(<Harness mode="timed" onFlag={flag} onCheck={check} />);
    fireEvent.keyDown(document.body, { key: 'f' });
    fireEvent.keyDown(document.body, { key: 'F', shiftKey: true });
    expect(flag).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledOnce();
  });

  it('ignores typing targets and disabled dialogs', () => {
    const next = vi.fn(), help = vi.fn();
    const { getByLabelText, rerender } = render(<Harness onNext={next} onShowHelp={help} />);
    fireEvent.keyDown(getByLabelText('search'), { key: 'ArrowRight' });
    fireEvent.keyDown(getByLabelText('search'), { key: '?' });
    expect(next).not.toHaveBeenCalled();
    expect(help).not.toHaveBeenCalled();
    rerender(<Harness disabled onNext={next} onShowHelp={help} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps Up/Down local and leaves Left/Right for page navigation', () => {
    const select = vi.fn();
    const event = { key: 'ArrowDown', preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: document.createElement('button') };
    handleRadioGroupKeyDown(event as never, ['A', 'B'], 'A', select);
    expect(select).toHaveBeenCalledWith('B');
    const left = { ...event, key: 'ArrowLeft' };
    handleRadioGroupKeyDown(left as never, ['A', 'B'], 'A', select);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('runs each navigation/check action once from interactive controls', () => {
    const previous = vi.fn(), next = vi.fn(), check = vi.fn();
    const { getByRole, getByLabelText } = render(<Harness mode="practice" onPrevious={previous} onNext={next} onCheck={check} />);
    fireEvent.keyDown(getByRole('radio'), { key: 'ArrowRight' });
    fireEvent.keyDown(getByLabelText('Next question'), { key: 'ArrowRight' });
    fireEvent.keyDown(getByRole('link'), { key: 'ArrowLeft' });
    fireEvent.keyDown(getByLabelText('TF answer'), { key: 'ArrowRight' });
    fireEvent.keyDown(getByLabelText('Check answer'), { key: 'Enter', ctrlKey: true });
    expect(next).toHaveBeenCalledTimes(3);
    expect(previous).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledOnce();
  });

  it('guards numeric/help shortcuts in every typing target and while disabled', () => {
    const select = vi.fn(), help = vi.fn();
    const { getByLabelText, rerender } = render(<Harness onSelectOptionByIndex={select} onShowHelp={help} />);
    for (const label of ['search', 'filter', 'notes', 'editor']) {
      fireEvent.keyDown(getByLabelText(label), { key: '2' });
      fireEvent.keyDown(getByLabelText(label), { key: '?' });
    }
    expect(select).not.toHaveBeenCalled();
    expect(help).not.toHaveBeenCalled();
    rerender(<Harness disabled onSelectOptionByIndex={select} onShowHelp={help} />);
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: '?' });
    expect(select).not.toHaveBeenCalled();
    expect(help).not.toHaveBeenCalled();
  });

  it('supports Home/End locally and never calls page navigation', () => {
    const select = vi.fn();
    for (const [key, expected] of [['Home', 'A'], ['End', 'D']] as const) {
      handleRadioGroupKeyDown({ key, preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: document.createElement('button') } as never, ['A', 'B', 'C', 'D'], 'B', select);
      expect(select).toHaveBeenLastCalledWith(expected);
    }
  });
});
