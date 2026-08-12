import { render, screen, within } from '@testing-library/react';
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
  }),
}));

function renderLayout(initialEntry: string, childText = 'Nội dung hồ sơ') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProfileLayout>
        <h1>{childText}</h1>
      </ProfileLayout>
    </MemoryRouter>,
  );
}

describe('ProfileLayout navigation', () => {
  it('contains only the two real Profile destinations', () => {
    renderLayout('/profile/dashboard');

    const navigation = screen.getByRole('navigation', { name: 'Điều hướng hồ sơ' });
    const links = within(navigation).getAllByRole('link');

    expect(links).toHaveLength(2);
    expect(navigation.querySelector('svg')).not.toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Tổng quan' })).toHaveAttribute(
      'href',
      '/profile/dashboard',
    );
    expect(within(navigation).getByRole('link', { name: 'Cài đặt' })).toHaveAttribute(
      'href',
      '/profile/settings',
    );
    expect(within(navigation).queryByRole('link', { name: 'Lịch sử học tập' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Điểm số & phân tích' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Trắc nghiệm AI' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Đề thi THPT' })).not.toBeInTheDocument();
  });

  it.each([
    ['/profile/dashboard', 'Tổng quan'],
    ['/profile/settings', 'Cài đặt'],
  ])('marks %s as the active destination', (initialEntry, activeLabel) => {
    renderLayout(initialEntry);

    expect(screen.getByRole('link', { name: activeLabel })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/profile/dashboard', 'Nội dung dashboard'],
    ['/profile/settings', 'Nội dung cài đặt'],
  ])('renders page content for %s without a Profile drawer or floating menu', (initialEntry, childText) => {
    renderLayout(initialEntry, childText);

    expect(screen.getByRole('heading', { name: childText })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đóng menu hồ sơ' })).not.toBeInTheDocument();
    expect(document.getElementById('profile-navigation')).not.toBeInTheDocument();
  });
});
