import type { AiCandidatePermission, User } from '@/types/auth';

export function hasPermission(user: User | null, permission: AiCandidatePermission): boolean {
  return user?.permissions?.includes(permission) ?? false;
}
