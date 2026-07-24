import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '../ProtectedRoute';
import { PERSONAL_LEARNING_DASHBOARD_ROUTE } from '@/features/dashboard/dashboardRoute';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => authState,
}));

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;
  return <p>Login from {from?.pathname ?? 'unknown'}</p>;
}

function renderRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route
          path="/profile/dashboard"
          element={(
            <ProtectedRoute>
              <h1>Profile dashboard</h1>
            </ProtectedRoute>
          )}
        />
        <Route path={PERSONAL_LEARNING_DASHBOARD_ROUTE} element={<h1>Public learning dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('dashboard route access policy', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it('keeps the learning dashboard public for anonymous users', () => {
    renderRoutes(PERSONAL_LEARNING_DASHBOARD_ROUTE);
    expect(screen.getByRole('heading', { name: 'Public learning dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/Login from/)).not.toBeInTheDocument();
  });

  it('keeps profile dashboard protected and preserves the attempted route', () => {
    renderRoutes('/profile/dashboard');
    expect(screen.getByText('Login from /profile/dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Profile dashboard' })).not.toBeInTheDocument();
  });

  it('allows authenticated users to keep using the profile dashboard', () => {
    authState.isAuthenticated = true;
    renderRoutes('/profile/dashboard');
    expect(screen.getByRole('heading', { name: 'Profile dashboard' })).toBeInTheDocument();
  });
});
