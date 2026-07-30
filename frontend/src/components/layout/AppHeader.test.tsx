import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AppHeader from './AppHeader';

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({
    currentUser: null,
    isAuthenticated: false,
    logout: vi.fn(),
  }),
}));

vi.mock('./useHeader', () => ({
  useHeader: () => ({ centerContent: null }),
}));

describe('AppHeader text controls', () => {
  it('opens and closes the public mobile navigation with the Menu text button', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppHeader />
      </MemoryRouter>,
    );

    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(screen.getByRole('img', { name: 'Lịch Sử Việt Nam 3D' })).toHaveAttribute(
      'src',
      expect.stringContaining('lich-su-viet-nam-3d-logo-header-transparent'),
    );
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveClass('app-header-standard');
    expect(screen.getByRole('link', { name: 'Cội Nguồn' })).toHaveAttribute('aria-current', 'page');
    expect(menu).toHaveTextContent('Menu');
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(document.getElementById('app-mobile-navigation')!).getByRole('link', {
        name: 'Sử liệu',
      }),
    ).toBeInTheDocument();

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});
