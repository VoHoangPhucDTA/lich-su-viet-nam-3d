/// <reference types="node" />

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminActionButton,
  AdminConfirmDialog,
  AdminDataTable,
  AdminField,
  AdminIconButton,
  AdminInlineAlert,
  AdminSelect,
  AdminSearchInput,
  AdminTooltip,
} from '../AdminUI';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Mở xác nhận</button>
      <AdminConfirmDialog
        open={open}
        title="Xác nhận thao tác"
        description="Kiểm tra focus"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe('Admin shared accessibility primitives', () => {
  it('keeps the crimson focus override scoped to Admin and provides forced-colors focus', () => {
    const adminStyles = readFileSync('src/index.css', 'utf8');
    expect(adminStyles).toContain('.admin-shell :where(a[href], button, input, select, textarea');
    expect(adminStyles).toContain('--admin-focus-ring');
    expect(adminStyles).toContain('@media (forced-colors: active)');
    expect(adminStyles).toContain('outline: 2px solid Highlight');
  });

  it('traps dialog focus, closes with Escape and restores the invoker', async () => {
    const user = userEvent.setup();
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    document.body.appendChild(appRoot);
    render(<DialogHarness />, { container: appRoot });

    const invoker = screen.getByRole('button', { name: 'Mở xác nhận' });
    await user.click(invoker);
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận thao tác' });
    expect(appRoot).toHaveAttribute('inert');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus());

    const confirm = screen.getByRole('button', { name: 'Xác nhận' });
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).not.toBeInTheDocument();
    expect(appRoot).not.toHaveAttribute('inert');
    expect(invoker).toHaveFocus();
    appRoot.remove();
  });

  it('uses select-only combobox semantics and an accessible name', async () => {
    const onChange = vi.fn();
    render(
      <AdminSelect
        value="draft"
        onValueChange={onChange}
        label="Trạng thái"
        options={[
          { value: "draft", label: "Bản nháp" },
          { value: "published", label: "Đã xuất bản" },
        ]}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Trạng thái' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveClass('admin-dropdown-trigger');

    fireEvent.click(trigger);
    expect(screen.getByRole('listbox', { name: 'Trạng thái' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Đã xuất bản' }));
    expect(onChange).toHaveBeenCalledWith('published');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the AdminSelect with Escape and returns focus to the trigger', () => {
    render(
      <AdminSelect
        value="draft"
        onValueChange={vi.fn()}
        label="Trạng thái"
        options={[
          { value: "draft", label: "Bản nháp" },
          { value: "published", label: "Đã xuất bản" },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trạng thái' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes the AdminSelect when focus leaves the trigger (Tab behaviour)', () => {
    render(
      <AdminSelect
        value="draft"
        onValueChange={vi.fn()}
        label="Trạng thái"
        options={[
          { value: "draft", label: "Bản nháp" },
          { value: "published", label: "Đã xuất bản" },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trạng thái' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves the active AdminSelect option with ArrowDown and selects with Enter', () => {
    const onChange = vi.fn();
    render(
      <AdminSelect
        value="draft"
        onValueChange={onChange}
        label="Trạng thái"
        options={[
          { value: "draft", label: "Bản nháp" },
          { value: "published", label: "Đã xuất bản" },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trạng thái' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('published');
  });

  it('AdminIconButton carries an accessible name, type=button and a pending lock', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <AdminIconButton label="Chỉnh sửa sự kiện" onClick={onClick}>
        <svg aria-hidden="true" />
      </AdminIconButton>,
    );
    const button = screen.getByRole('button', { name: 'Chỉnh sửa sự kiện' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <AdminIconButton label="Chỉnh sửa sự kiện" pending onClick={onClick}>
        <svg aria-hidden="true" />
      </AdminIconButton>,
    );
    expect(screen.getByRole('button', { name: 'Chỉnh sửa sự kiện' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chỉnh sửa sự kiện' })).toHaveAttribute('aria-busy', 'true');
  });

  it('AdminTooltip wraps children, keeps the accessible name on the control and shows a portaled tooltip on hover', async () => {
    render(
      <AdminTooltip label="Xem sự kiện">
        <button type="button" aria-label="Xem sự kiện">
          <svg aria-hidden="true" />
        </button>
      </AdminTooltip>,
    );
    const button = screen.getByRole('button', { name: 'Xem sự kiện' });
    const host = button.closest('.admin-tooltip-host');
    expect(host).not.toBeNull();

    fireEvent.mouseEnter(host!);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Xem sự kiện');
    expect(tooltip).not.toHaveAttribute('data-tooltip');
    // The bubble is portaled to document.body, never laid out inside the table
    // cell, so it cannot be squeezed into a vertical column.
    expect(host!.contains(tooltip)).toBe(false);
    expect(tooltip).toHaveStyle({ position: 'fixed', whiteSpace: 'nowrap' });

    fireEvent.mouseLeave(host!);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('AdminSearchInput owns a single border layer on the wrapper with a borderless inner input', () => {
    render(<AdminSearchInput value="" onChange={() => undefined} placeholder="Tìm kiếm…" />);
    const wrapper = screen.getByLabelText('Tìm kiếm…').closest('label');
    expect(wrapper).toHaveClass('admin-search-field');
    expect(screen.getByLabelText('Tìm kiếm…')).toHaveClass('admin-search-input');
    const css = readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n');
    expect(css).toContain('.admin-shell :where(input, select, textarea):focus-visible');
    expect(css).toContain('outline: none;\n  border-color: var(--admin-accent);');
  });

  it('links invalid fields to alert text and exposes success through a status live region', () => {
    render(
      <>
        <AdminField label="Tên sự kiện" value="" error="Tên là bắt buộc" readOnly />
        <AdminInlineAlert tone="success">Đã lưu dữ liệu.</AdminInlineAlert>
      </>,
    );
    const field = screen.getByRole('textbox', { name: 'Tên sự kiện' });
    const error = screen.getByRole('alert');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', error.id);
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu dữ liệu.');
  });

  it('gives data tables a caption, scoped headers and keyboard-focusable scroll region', () => {
    render(
      <AdminDataTable
        caption="Danh sách sự kiện"
        columns={[{ key: 'title', header: 'Tên', render: row => row.title }]}
        rows={[{ id: 'one', title: 'Bạch Đằng' }]}
        getKey={row => row.id}
      />,
    );

    const region = screen.getByRole('region', { name: 'Danh sách sự kiện' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('Danh sách sự kiện', { selector: 'caption' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tên' })).toHaveAttribute('scope', 'col');
    expect(screen.getByText('Bạch Đằng').closest('td')).toHaveAttribute('data-label', 'Tên');
  });

  it('AdminActionButton defaults to type="button" and is focusable when enabled', () => {
    render(<AdminActionButton variant="primary">Lưu</AdminActionButton>);
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toHaveClass('admin-primary-button');
  });

  it('AdminActionButton sets aria-busy and locks double-click when pending', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <AdminActionButton variant="primary" pending onClick={onClick}>
        Đang lưu…
      </AdminActionButton>,
    );
    const button = screen.getByRole('button', { name: 'Đang lưu…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('data-pending', 'true');
    expect(button).toBeDisabled();

    rerender(
      <AdminActionButton variant="primary" pending={false} onClick={onClick}>
        Đang lưu…
      </AdminActionButton>,
    );
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('AdminActionButton preserves the submit type when explicitly requested', () => {
    render(<AdminActionButton type="submit">Lưu</AdminActionButton>);
    expect(screen.getByRole('button', { name: 'Lưu' })).toHaveAttribute('type', 'submit');
  });
});
