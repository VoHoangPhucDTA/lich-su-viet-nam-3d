export type UserRole = 'student' | 'teacher' | 'admin';

export type AiCandidatePermission =
  | 'AI_CANDIDATE_CREATE' | 'AI_CANDIDATE_VIEW' | 'AI_CANDIDATE_EDIT'
  | 'AI_CANDIDATE_SUBMIT' | 'AI_CANDIDATE_REVIEW' | 'AI_CANDIDATE_PUBLISH'
  | 'AI_CANDIDATE_AUDIT_VIEW';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  permissions?: AiCandidatePermission[];
  grade?: '10' | '11' | '12' | 'other';
  school?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface AuthResponse {
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

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  fullName?: string;
  grade?: '10' | '11' | '12' | 'other';
  school?: string;
  avatarUrl?: string;
}
