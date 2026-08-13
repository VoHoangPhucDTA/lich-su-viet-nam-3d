import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppHeader from './AppHeader';

const authState = vi.hoisted(() => ({
  currentUser: null as null | {
    fullName: string;
    role: 'student' | 'admin';
  },
  isAuthenticated: false,
  logout: vi.fn(),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('./useHeader', () => ({
  useHeader: () => ({ centerContent: null }),
}));

describe('AppHeader text controls', () => {
  beforeEach(() => {
    authState.currentUser = null;
    authState.isAuthenticated = false;
    authState.logout.mockReset();
  });

  it('opens and closes the public mobile navigation with the Menu text button', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppHeader />
      </MemoryRouter>,
    );

    const menu = screen.getByRole('button', { name: 'Menu' });
    const logo = screen.getByRole('img', { name: 'Lịch Sử Việt Nam 3D' });
    expect(logo).toHaveAttribute(
      'src',
      expect.stringContaining('/home-images/home-logo-384.webp'),
    );
    expect(logo).toHaveAttribute('fetchpriority', 'low');
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveClass('app-header-standard');
    expect(screen.getByRole('link', { name: 'Cội Nguồn' })).toHaveAttribute('aria-current', 'page');
    expect(menu).toHaveTextContent('Menu');
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(document.getElementById('app-mobile-navigation')!).getByRole('link', {
        name: 'Sự kiện',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Thời kỳ' })).not.toBeInTheDocument();

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps only Profile overview and settings in the authenticated desktop dropdown', async () => {
    const user = userEvent.setup();
    authState.currentUser = {
      fullName: 'Nguyễn Văn A',
      role: 'student',
    };
    authState.isAuthenticated = true;

    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppHeader />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Luyện tập với AI' })).toHaveAttribute(
      'href',
      '/quiz',
    );
    expect(screen.getByRole('link', { name: 'Luyện thi THPT' })).toHaveAttribute(
      'href',
      '/exams',
    );

    await user.click(screen.getByRole('button', { name: 'Nguyễn Văn A' }));

    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute(
      'href',
      '/profile/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Cài đặt' })).toHaveAttribute(
      'href',
      '/profile/settings',
    );
    expect(screen.queryByRole('link', { name: 'Lịch sử' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('keeps Sự kiện active for Browse and omits the former period destination', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/browse?period=feudal']}>
        <AppHeader />
      </MemoryRouter>,
    );

    const desktopLink = screen.getByRole('link', { name: 'Sự kiện' });
    expect(desktopLink).toHaveAttribute('href', '/browse');
    expect(desktopLink).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Thời kỳ' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const mobileNavigation = document.getElementById('app-mobile-navigation')!;
    expect(within(mobileNavigation).getByRole('link', { name: 'Sự kiện' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Sử liệu' })).not.toBeInTheDocument();
    expect(within(mobileNavigation).queryByRole('link', { name: 'Thời kỳ' })).not.toBeInTheDocument();
  });

  it.each(['/quiz', '/quiz/history'])(
    'keeps Luyện tập với AI active in desktop and mobile navigation at %s',
    async (route) => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={[route]}>
          <AppHeader />
        </MemoryRouter>,
      );

      const desktopLink = screen.getByRole('link', { name: 'Luyện tập với AI' });
      expect(desktopLink).toHaveAttribute('href', '/quiz');
      expect(desktopLink).toHaveAttribute('aria-current', 'page');
      expect(desktopLink).toHaveClass('text-red-900');

      await user.click(screen.getByRole('button', { name: 'Menu' }));
      const mobileNavigation = document.getElementById('app-mobile-navigation');
      expect(mobileNavigation).not.toBeNull();
      const mobileLink = within(mobileNavigation!).getByRole('link', {
        name: 'Luyện tập với AI',
      });
      expect(mobileLink).toHaveAttribute('href', '/quiz');
      expect(mobileLink).toHaveAttribute('aria-current', 'page');
      expect(mobileLink).toHaveClass('bg-red-50', 'text-red-900', 'font-bold');
    },
  );
});
