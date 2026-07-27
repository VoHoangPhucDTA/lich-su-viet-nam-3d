import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminConfirmDialog,
  AdminDataTable,
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
    fireEvent.change(select, { target: { value: 'published' } });
    expect(onChange).toHaveBeenCalledWith('published');
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
  });
});
