import type { ReactNode } from 'react';
import type { AiCandidatePermission } from '@/types/auth';
import { useAuth } from './AuthContext';
import { hasPermission } from './permissions';

export default function PermissionGuard({ permission, children }: { permission: AiCandidatePermission; children: ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <p role="status">Đang kiểm tra quyền truy cập...</p>;
  if (!hasPermission(currentUser, permission)) {
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Không có quyền truy cập</h1><p className="mt-3">Tài khoản không có permission {permission}. Quyền phía server vẫn là nguồn quyết định cuối cùng.</p></main>;
  }
  return <>{children}</>;
}
