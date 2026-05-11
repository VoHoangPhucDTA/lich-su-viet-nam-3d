export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  grade?: '10' | '11' | '12' | 'other';
  school?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface VerifyEmailResponse {
  message: string;
  auth?: AuthResponse | null;
}

export interface RegisterResponse {
  user: User;
  email: string;
  status: 'pending' | 'active';
  verificationExpiresAt: string;
  verificationTtlSeconds: number;
  message: string;
  devVerificationUrl?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName?: string;
  grade?: '10' | '11' | '12' | 'other';
  school?: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  fullName?: string;
  grade?: '10' | '11' | '12' | 'other';
  school?: string;
  avatarUrl?: string;
}
