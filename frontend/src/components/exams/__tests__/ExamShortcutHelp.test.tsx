import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExamShortcutHelp from '../ExamShortcutHelp';

describe('ExamShortcutHelp semantics', () => {
  it('describes the dialog with existing description and notes ids', () => {
    render(<ExamShortcutHelp id="help" isOpen onClose={vi.fn()} triggerRef={createRef()} shortcuts={[]} description="Primary description" notes="Additional note" />);
    const dialog = screen.getByRole('dialog');
    const ids = dialog.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain('undefined');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(['Primary description', 'Additional note']);
  });

  it('uses only the existing description id without notes', () => {
    render(<ExamShortcutHelp id="help" isOpen onClose={vi.fn()} triggerRef={createRef()} shortcuts={[]} description="Primary description" />);
    const ids = screen.getByRole('dialog').getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toHaveLength(1);
    expect(document.getElementById(ids[0])?.textContent).toBe('Primary description');
  });
});
