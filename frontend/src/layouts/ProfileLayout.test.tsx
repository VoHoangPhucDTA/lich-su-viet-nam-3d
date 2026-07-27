import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ProfileLayout from './ProfileLayout';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      fullName: 'Nguyễn Văn A',
      grade: '12',
      school: 'THPT Nguyễn Huệ',
    },
    logout: vi.fn(),
  }),
}));

describe('ProfileLayout navigation', () => {
  it('exposes the active route and mobile menu state', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/profile/settings']}>
        <ProfileLayout>
          <h1>Cài đặt tài khoản</h1>
        </ProfileLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Cài đặt' })).toHaveAttribute('aria-current', 'page');

    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-controls', 'profile-navigation');
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Đóng menu hồ sơ' })).toBeInTheDocument();
  });
});
