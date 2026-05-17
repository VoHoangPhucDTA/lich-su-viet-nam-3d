import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type {
  AuthResponse,
  User,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  UpdateProfileRequest,
  VerifyEmailResponse,
} from '../types/auth';
import * as authService from '../services/authService';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean; // true while restoring session from localStorage
  login: (req: LoginRequest) => Promise<AuthResponse>;
  register: (req: RegisterRequest) => Promise<RegisterResponse>;
  resendVerification: (email: string) => Promise<RegisterResponse>;
  verifyEmail: (token: string) => Promise<VerifyEmailResponse>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (req: ResetPasswordRequest) => Promise<{ message: string }>;
  loginWithGoogle: (idToken: string) => Promise<AuthResponse>;
  loginWithFacebook: (accessToken: string) => Promise<AuthResponse>;
  updateProfile: (updates: UpdateProfileRequest) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount: đọc User info từ localStorage (token ở HttpOnly Cookie, không cần đọc)
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (req: LoginRequest): Promise<AuthResponse> => {
    const res = await authService.login(req);
    setCurrentUser(res.user);
    return res; // trả về để caller (LoginPage) lấy role mà không cần loadFromStorage
  }, []);

  const register = useCallback(async (req: RegisterRequest) => {
    const res = await authService.register(req);
    setCurrentUser(null);
    return res;
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    return authService.resendVerification({ email });
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    const res = await authService.verifyEmail(token);
    if (res.auth) {
      setCurrentUser(res.auth.user);
    }
    return res;
  }, []);

  /**
   * logout: luôn clear state dù API có lỗi hay không.
   * Dùng try/finally ở cả 2 tầng để đảm bảo:
   *   1. authService.logout() catch lỗi API → không throw
   *   2. setCurrentUser(null) luôn chạy ở đây
   * → Không bao giờ gây màn hình đơ (hang) cho người dùng.
   */
  const logout = useCallback(async () => {
    try {
      // Bước 6D.1.3: AuthContext.tsx: gọi authService.logout() trong khối try — nếu lỗi API, finally vẫn chạy
      await authService.logout();
    } finally {
      // Bước 6D.1.8: AuthContext.tsx: gọi setCurrentUser(null) — luôn thực thi kể cả khi API lỗi
      setCurrentUser(null);
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return authService.forgotPassword(email);
  }, []);

  const resetPassword = useCallback(async (req: ResetPasswordRequest) => {
    return authService.resetPassword(req);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string): Promise<AuthResponse> => {
    const res = await authService.loginWithGoogle(idToken);
    setCurrentUser(res.user);
    return res;
  }, []);

  const loginWithFacebook = useCallback(async (accessToken: string): Promise<AuthResponse> => {
    const res = await authService.loginWithFacebook(accessToken);
    setCurrentUser(res.user);
    return res;
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
        resendVerification,
        verifyEmail,
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
