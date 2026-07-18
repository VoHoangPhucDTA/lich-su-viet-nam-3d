import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminFilterSelect,
  AdminPageHeader,
  AdminPagination,
  AdminSearchInput,
  AdminSelect,
  AdminStatusBadge,
  type AdminDataColumn,
} from '../../components/admin/AdminUI';
import { getAdminUsers, setAdminUserRole, setAdminUserStatus, type AdminUser } from '../../services/adminApi';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;
type PendingAction = { user: AdminUser; field: 'status' | 'role'; value: string } | null;

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAdminUsers({
        q: appliedQuery || undefined,
        status: status || undefined,
        role: role || undefined,
        limit: LIMIT,
        offset,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách người dùng.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, offset, role, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized === appliedQuery) return;
    const timer = window.setTimeout(() => {
      setOffset(0);
      setAppliedQuery(normalized);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [appliedQuery, query]);

  const clearFilters = () => {
    setQuery('');
    setAppliedQuery('');
    setStatus('');
    setRole('');
    setOffset(0);
  };

  const confirmAction = async () => {
    if (!pendingAction || updating) return;
    const action = pendingAction;
    setPendingAction(null);
    setUpdating(true);
    setError('');
    try {
      if (action.field === 'status') {
        await setAdminUserStatus(action.user.id, action.value as AdminUser['status']);
      } else {
        await setAdminUserRole(action.user.id, action.value as AdminUser['role']);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật tài khoản.');
    } finally {
      setUpdating(false);
    }
  };

  const hasFilters = Boolean(appliedQuery || status || role);
  const searchPending = query.trim() !== appliedQuery;

  const columns: AdminDataColumn<AdminUser>[] = [
    {
      key: 'user',
      header: 'Người dùng',
      render: user => (
        <div className="min-w-56">
          <p className="font-semibold text-[var(--text-primary)]">{user.fullName}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Lớp / trường',
      render: user => (
        <span className="text-xs leading-5 text-[var(--text-secondary)]">
          {user.grade ? `Lớp ${user.grade}` : '—'}<br />{user.school ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: user => (
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusBadge status={user.status} />
          <AdminSelect compact label={`\u0110\u1ed5i tr\u1ea1ng th\u00e1i ${user.fullName}`} value={user.status} disabled={updating} onValueChange={value => setPendingAction({ user, field: 'status', value })} options={[{ value: 'active', label: 'Ho\u1ea1t \u0111\u1ed9ng' }, { value: 'pending', label: 'Ch\u1edd x\u00e1c th\u1ef1c' }, { value: 'disabled', label: '\u0110\u00e3 kh\u00f3a' }]} />
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Quyền',
      render: user => (
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusBadge status={user.role} />
          <AdminSelect compact label={`\u0110\u1ed5i quy\u1ec1n ${user.fullName}`} value={user.role} disabled={updating} onValueChange={value => setPendingAction({ user, field: 'role', value })} options={[{ value: 'student', label: 'H\u1ecdc sinh' }, { value: 'admin', label: 'Admin' }]} />
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Tạo lúc',
      render: user => <time dateTime={user.createdAt} className="whitespace-nowrap text-xs text-[var(--text-muted)]">{new Date(user.createdAt).toLocaleDateString('vi-VN')}</time>,
    },
    {
      key: 'lastActivity',
      header: 'Hoạt động gần nhất',
      render: user => user.lastActivity
        ? <time dateTime={user.lastActivity} className="whitespace-nowrap text-xs text-[var(--text-muted)]">{new Date(user.lastActivity).toLocaleDateString('vi-VN')}</time>
        : <span className="text-xs text-[var(--text-muted)]">Chưa có hoạt động</span>,
    },
  ];

  return (
    <AdminLayout title="Người dùng">
      <AdminPageHeader title="Người dùng" description="Tìm kiếm, lọc và quản lý tài khoản trong hệ thống." />

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--admin-shadow)]">
        <div className="space-y-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="flex flex-col gap-2 lg:flex-row">
            <AdminSearchInput
              value={query}
              onChange={event => setQuery(event.target.value)}
              onSubmit={() => {
                setOffset(0);
                setAppliedQuery(query.trim());
              }}
              placeholder="Tìm theo tên hoặc email..."
            />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <AdminFilterSelect
                value={status}
                onValueChange={value => { setOffset(0); setStatus(value); }}
                label="Trạng thái"
                options={[
                  { value: '', label: 'Trạng thái: Tất cả' },
                  { value: 'active', label: 'Hoạt động' },
                  { value: 'pending', label: 'Chờ xác thực' },
                  { value: 'disabled', label: 'Đã khóa' },
                ]}
              />
              <AdminFilterSelect
                value={role}
                onValueChange={value => { setOffset(0); setRole(value); }}
                label="Quyền"
                options={[
                  { value: '', label: 'Quyền: Tất cả' },
                  { value: 'student', label: 'Học sinh' },
                  { value: 'admin', label: 'Admin' },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>{searchPending ? 'Đang tìm…' : `${total} tài khoản`}</span>
            {hasFilters && <button type="button" onClick={clearFilters} className="admin-text-button">Xóa bộ lọc</button>}
          </div>
        </div>

        <AdminDataTable
          columns={columns}
          rows={items}
          getKey={user => user.id}
          minWidth="900px"
          loading={loading}
          error={error || undefined}
          onRetry={() => void load()}
          emptyTitle="Không tìm thấy tài khoản"
          emptyDescription="Thử thay đổi từ khóa hoặc bộ lọc để tìm dữ liệu khác."
          footer={<AdminPagination total={total} offset={offset} limit={LIMIT} loading={loading} onChange={setOffset} />}
        />
      </section>

      <AdminConfirmDialog
        open={Boolean(pendingAction)}
        title="Xác nhận thay đổi"
        description={pendingAction ? `Bạn có chắc muốn đổi ${pendingAction.field === 'role' ? 'quyền' : 'trạng thái'} của ${pendingAction.user.fullName}?` : undefined}
        confirmLabel="Cập nhật"
        onConfirm={() => void confirmAction()}
        onCancel={() => setPendingAction(null)}
        danger={pendingAction?.value === 'disabled' || pendingAction?.field === 'role' && pendingAction.value === 'student'}
      />
    </AdminLayout>
  );
}