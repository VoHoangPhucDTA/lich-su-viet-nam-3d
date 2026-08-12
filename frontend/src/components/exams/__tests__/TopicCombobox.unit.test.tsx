import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import TopicCombobox, { type TopicComboboxOption } from '../TopicCombobox';

function Harness({
  onSelect,
  options,
  selectedSlug,
  hasNextControl = false,
}: {
  onSelect: (option: TopicComboboxOption) => void;
  options: TopicComboboxOption[];
  selectedSlug: string;
  hasNextControl?: boolean;
}) {
  const [current, setCurrent] = useState(selectedSlug);
  return (
    <div>
      <TopicCombobox
        label="Test topic"
        options={options}
        selectedSlug={current}
        onSelect={(option) => {
          setCurrent(option.slug);
          onSelect(option);
        }}
      />
      {hasNextControl && (
        <button type="button" data-testid="next-control">Sau</button>
      )}
      <output data-testid="current-slug">{current || 'EMPTY'}</output>
    </div>
  );
}

const sampleOptions: TopicComboboxOption[] = [
  { slug: 'cach-mang-thang-tam-1945', title: 'Cách mạng tháng Tám 1945', questionCount: 60, mcqCount: 40, tfCount: 20 },
  { slug: 'khang-chien-chong-phap-1945-1954', title: 'Kháng chiến chống Pháp 1945-1954', questionCount: 80, mcqCount: 60, tfCount: 20 },
  { slug: 'asean', title: 'ASEAN và Việt Nam', questionCount: 30, mcqCount: 25, tfCount: 5 },
];

describe('TopicCombobox — editable combobox pattern', () => {
  it('renders input as the combobox with aria-expanded=false when closed', () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    expect(combobox.tagName).toBe('INPUT');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
    expect(combobox).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opening via click reveals the full listbox and exposes aria-expanded=true', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    await userEvent.click(combobox);
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));
    const listbox = screen.getByRole('listbox', { name: 'Test topic' });
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it('typing in the input is the same element as the combobox and applies a filter', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });

    combobox.focus();
    fireEvent.change(combobox, { target: { value: 'khang' } });

    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));
    const listbox = screen.getByRole('listbox', { name: 'Test topic' });
    await waitFor(() => {
      expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(1);
    });
    const option = listbox.querySelector('[role="option"]') as HTMLElement;
    expect(option.textContent).toContain('Kháng chiến');
  });

  it('Vietnamese diacritic-insensitive search matches "khang" against "Kháng"', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    combobox.focus();
    fireEvent.change(combobox, { target: { value: 'khang' } });

    await waitFor(() => {
      const listbox = screen.getByRole('listbox', { name: 'Test topic' });
      const options = listbox.querySelectorAll('[role="option"]');
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]?.textContent).toContain('Kháng');
    });
  });

  it('case-insensitive: "ASEAN" matches the ASEAN entry', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    combobox.focus();
    fireEvent.change(combobox, { target: { value: 'ASEAN' } });

    await waitFor(() => {
      const listbox = screen.getByRole('listbox', { name: 'Test topic' });
      const options = listbox.querySelectorAll('[role="option"]');
      expect(options).toHaveLength(1);
      expect(options[0]?.textContent).toContain('ASEAN');
    });
  });

  it('mousedown on an option commits the canonical slug, closes popup, and reflects the input value', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    await userEvent.click(combobox);
    const listbox = screen.getByRole('listbox', { name: 'Test topic' });
    fireEvent.change(combobox, { target: { value: 'khang' } });

    await waitFor(() => {
      expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(1);
    });
    const option = listbox.querySelector('[role="option"]') as HTMLElement;
    fireEvent.mouseDown(option);

    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.getByTestId('current-slug').textContent).toBe('khang-chien-chong-phap-1945-1954');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: 'khang-chien-chong-phap-1945-1954' }));
    expect(combobox).toHaveValue('Kháng chiến chống Pháp 1945-1954');
  });

  it('keyboard: ArrowDown + Enter on the combobox commits the active option', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    combobox.focus();

    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));

    fireEvent.keyDown(combobox, { key: 'Enter' });
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'false'));
    expect(onSelect).toHaveBeenCalled();
    expect(onSelect.mock.calls[0]?.[0]?.slug).toBe(sampleOptions[0]!.slug);
  });

  it('Escape closes the popup and keeps focus on the input (combobox role)', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    await userEvent.click(combobox);
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));
    fireEvent.keyDown(combobox, { key: 'Escape' });
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'false'));
    expect(combobox).toHaveFocus();
  });

  it('Tab closes the popup and moves focus to the next focusable element (not back to itself)', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" hasNextControl />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    const nextControl = screen.getByTestId('next-control');

    await userEvent.click(combobox);
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));

    await userEvent.tab();

    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'false'));
    expect(nextControl).toHaveFocus();
    expect(combobox).not.toHaveFocus();
  });

  it('aria-activedescendant points at the active option when popup open', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    await userEvent.click(combobox);
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));

    const listbox = screen.getByRole('listbox', { name: 'Test topic' });
    const firstOption = listbox.querySelector('[role="option"]') as HTMLElement;
    expect(combobox.getAttribute('aria-activedescendant')).toBe(firstOption.id);
  });

  it('closing clears the active index so reopening does not lock onto a stale entry', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="asean" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });

    await userEvent.click(combobox);
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));
    fireEvent.keyDown(combobox, { key: 'Escape' });
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'false'));

    await userEvent.click(combobox);
    await waitFor(() => expect(combobox).toHaveAttribute('aria-expanded', 'true'));
    const listbox = screen.getByRole('listbox', { name: 'Test topic' });
    const activeDescendantId = combobox.getAttribute('aria-activedescendant');
    expect(activeDescendantId).toBeTruthy();
    const node = listbox.querySelector(`#${activeDescendantId}`);
    expect(node?.getAttribute('aria-selected')).toBe('true');
  });

  it('empty-state message appears when filter matches no options', async () => {
    render(<Harness onSelect={() => {}} options={sampleOptions} selectedSlug="" />);
    const combobox = screen.getByRole('combobox', { name: 'Test topic' });
    await userEvent.click(combobox);
    fireEvent.change(combobox, { target: { value: 'XYZ-no-match' } });
    await waitFor(() => {
      expect(screen.getByText(/Không tìm thấy chủ đề phù hợp/i)).toBeInTheDocument();
    });
  });
});
