/// <reference types="node" />

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminField,
  AdminInlineAlert,
  AdminSelect,
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

  it('uses native select keyboard semantics and an accessible name', async () => {
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

    const select = screen.getByRole('combobox', { name: 'Trạng thái' });
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveClass('admin-dropdown-trigger');
    expect(select.parentElement?.querySelector('.admin-dropdown-chevron')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.change(select, { target: { value: 'published' } });
    expect(onChange).toHaveBeenCalledWith('published');
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
});
