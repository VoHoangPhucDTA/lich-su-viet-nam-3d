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
      permissions: ['AI_CANDIDATE_VIEW'],
    },
    logout: vi.fn(),
  }),
}));

describe('AdminLayout mobile navigation accessibility', () => {
  it('shows only Admin destinations and omits public Learning and Map links', () => {
    render(
      <MemoryRouter>
        <AdminLayout><p>Nội dung</p></AdminLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sự kiện lịch sử' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Duyệt câu hỏi AI' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trang học tập' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bản đồ' })).not.toBeInTheDocument();
    expect(screen.queryByText('Liên kết')).not.toBeInTheDocument();
  });

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
