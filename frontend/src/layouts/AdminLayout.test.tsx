import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AdminLayout from './AdminLayout';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      id: 'admin-id',
      fullName: 'Admin kiểm thử',
      email: 'admin@example.invalid',
      role: 'admin',
    },
    logout: vi.fn(),
  }),
}));

describe('AdminLayout mobile navigation accessibility', () => {
  it('traps focus, makes the background inert, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminLayout><button type="button">Nội dung nền</button></AdminLayout>
      </MemoryRouter>,
    );

    const opener = screen.getByRole('button', { name: 'Mở menu quản trị' });
    await user.click(opener);

    const main = document.getElementById('admin-main-content');
    expect(main).toHaveAttribute('inert');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đóng menu quản trị' })).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(main).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });
});
