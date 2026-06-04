import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, LoginRequest, RegisterRequest, UpdateProfileRequest } from '../types/auth';
import * as authService from '../services/authService';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean; // true while restoring session from localStorage
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (newPassword: string) => Promise<{ message: string }>;
  loginWithGoogle: () => Promise<void>;
  loginWithFacebook: () => Promise<void>;
  updateProfile: (updates: UpdateProfileRequest) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const stored = authService.loadFromStorage();
    if (stored) {
      setCurrentUser(stored.user);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const res = await authService.login(req);
    setCurrentUser(res.user);
  }, []);

  const register = useCallback(async (req: RegisterRequest) => {
    const res = await authService.register(req);
    setCurrentUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setCurrentUser(null);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return authService.forgotPassword(email);
  }, []);

  const resetPassword = useCallback(async (newPassword: string) => {
    return authService.resetPassword(newPassword);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const res = await authService.loginWithGoogle();
    setCurrentUser(res.user);
  }, []);

  const loginWithFacebook = useCallback(async () => {
    const res = await authService.loginWithFacebook();
    setCurrentUser(res.user);
  }, []);

  const updateProfileFn = useCallback(async (updates: UpdateProfileRequest) => {
    const updatedUser = await authService.updateProfile(updates);
    setCurrentUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: currentUser !== null,
        isLoading,
        login,
        register,
        logout,
        forgotPassword,
        resetPassword,
        loginWithGoogle,
        loginWithFacebook,
        updateProfile: updateProfileFn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
