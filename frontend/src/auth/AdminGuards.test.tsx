import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProtectedRoute from './ProtectedRoute';
import RoleGuard from './RoleGuard';
import { useAuth } from './AuthContext';
import type { User } from '../types/auth';

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

const auth = vi.mocked(useAuth);
const authValue = (
  currentUser: User | null,
  isAuthenticated = currentUser !== null,
): ReturnType<typeof useAuth> => ({
  currentUser,
  isAuthenticated,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  resendVerification: vi.fn(),
  verifyEmail: vi.fn(),
  logout: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithFacebook: vi.fn(),
  updateProfile: vi.fn(),
});

const user = (role: User['role']): User => ({
  id: `${role}-id`,
  fullName: role,
  email: `${role}@example.test`,
  role,
});

describe('Admin route guards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders admin content for an authenticated admin', () => {
    auth.mockReturnValue(authValue(user('admin')));

    render(
      <MemoryRouter>
        <RoleGuard requiredRole="admin"><span>admin content</span></RoleGuard>
      </MemoryRouter>,
    );
    expect(screen.getByText('admin content')).toBeInTheDocument();
  });

  it('renders forbidden content for an authenticated non-admin', () => {
    auth.mockReturnValue(authValue(user('teacher')));

    render(
      <MemoryRouter>
        <RoleGuard requiredRole="admin"><span>admin content</span></RoleGuard>
      </MemoryRouter>,
    );
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
    expect(screen.getByText(/403/)).toBeInTheDocument();
  });

  it('redirects an unauthenticated user before reaching an Admin route', () => {
    auth.mockReturnValue(authValue(null, false));

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route path="/admin/dashboard" element={<ProtectedRoute><span>admin content</span></ProtectedRoute>} />
          <Route path="/login" element={<span>login page</span>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('login page')).toBeInTheDocument();
  });
});
