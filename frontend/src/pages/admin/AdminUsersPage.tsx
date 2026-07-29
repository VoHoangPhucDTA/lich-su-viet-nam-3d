import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../layouts/AdminLayout';
import {
  AdminDataTable,
  AdminFilterSelect,
  AdminPageHeader,
  AdminPagination,
  AdminSearchInput,
  AdminStatusBadge,
  type AdminDataColumn,
} from '../../components/admin/AdminUI';
import {
  getAdminUsers,
  type AdminUserListParams,
  type AdminUserListItem,
  type AdminUserRole,
  type AdminUserStatus,
} from '../../services/adminApi';
import { ApiRequestError } from '../../services/apiClient';

const DEFAULT_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;
type AdminUserListState = AdminUserListParams & {
  sortBy: NonNullable<AdminUserListParams['sortBy']>;
  sortDir: NonNullable<AdminUserListParams['sortDir']>;
  limit: number;
  offset: number;
};

const options = {
  status: [
    { value: '', label: 'Trạng thái: Tất cả' },
    { value: 'active', label: 'Hoạt động' },
    { value: 'pending', label: 'Chờ xác thực' },
    { value: 'disabled', label: 'Đã khóa' },
    { value: 'deleted', label: 'Đã xóa (trạng thái DB)' },
  ],
  role: [
    { value: '', label: 'Quyền: Tất cả' },
    { value: 'student', label: 'Học sinh' },
    { value: 'teacher', label: 'Giáo viên' },
    { value: 'admin', label: 'Quản trị' },
  ],
  verified: [
    { value: '', label: 'Xác thực: Tất cả' },
    { value: 'true', label: 'Đã ghi nhận xác thực' },
    { value: 'false', label: 'Chưa ghi nhận xác thực' },
  ],
  sort: [
    { value: 'createdAt:desc', label: 'Tạo mới nhất' },
    { value: 'createdAt:asc', label: 'Tạo cũ nhất' },
    { value: 'updatedAt:desc', label: 'Cập nhật mới nhất' },
    { value: 'updatedAt:asc', label: 'Cập nhật cũ nhất' },
    { value: 'displayName:asc', label: 'Tên A–Z' },
    { value: 'displayName:desc', label: 'Tên Z–A' },
    { value: 'email:asc', label: 'Email A–Z' },
    { value: 'email:desc', label: 'Email Z–A' },
  ],
};

function numberValue(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function errorMessage(cause: unknown) {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (cause.status === 403) return 'Bạn không có quyền xem dữ liệu quản trị này.';
    return cause.message;
  }
  return cause instanceof Error ? cause.message : 'Không thể tải danh sách người dùng.';
}

function roleLabel(role: AdminUserRole) {
  return role === 'admin' ? 'Quản trị' : role === 'teacher' ? 'Giáo viên' : 'Học sinh';
}

export default function AdminUsersPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const urlQuery = params.get('q') ?? '';
  const [search, setSearch] = useState(urlQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(urlQuery), 0);
    return () => window.clearTimeout(timer);
  }, [urlQuery]);

  useEffect(() => {
    if (search.trim() === urlQuery) return;
    const timer = window.setTimeout(() => {
      setParams(previous => {
        const next = new URLSearchParams(previous);
        const value = search.trim();
        if (value) next.set('q', value); else next.delete('q');
        next.delete('offset');
        return next;
      }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, setParams, urlQuery]);

  const state = useMemo<AdminUserListState>(() => ({
    q: urlQuery || undefined,
    role: (params.get('role') || undefined) as AdminUserRole | undefined,
    status: (params.get('status') || undefined) as AdminUserStatus | undefined,
    verified: (params.get('verified') || undefined) as 'true' | 'false' | undefined,
    sortBy: (params.get('sortBy') || 'createdAt') as NonNullable<AdminUserListParams['sortBy']>,
    sortDir: (params.get('sortDir') || 'desc') as NonNullable<AdminUserListParams['sortDir']>,
    limit: numberValue(params.get('limit')) ?? DEFAULT_LIMIT,
    offset: numberValue(params.get('offset')) ?? 0,
  }), [params, urlQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getAdminUsers(state, controller.signal);
        if (response.items.length === 0 && state.offset > 0 && state.offset >= response.total) {
          const nearestOffset = Math.max(
            0,
            Math.floor(Math.max(response.total - 1, 0) / state.limit) * state.limit,
          );
          setParams(previous => {
            const next = new URLSearchParams(previous);
            if (nearestOffset > 0) next.set('offset', String(nearestOffset));
            else next.delete('offset');
            return next;
          }, { replace: true });
          return;
        }
        setItems(response.items);
        setTotal(response.total);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(errorMessage(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [retry, setParams, state]);

  const setValue = (key: string, value: string) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value); else next.delete(key);
      next.delete('offset');
      return next;
    });
  };

  const setSort = (value: string) => {
    const [sortBy, sortDir] = value.split(':');
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('sortBy', sortBy);
      next.set('sortDir', sortDir);
      next.delete('offset');
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setParams(previous => {
      const next = new URLSearchParams(previous);
      ['q', 'status', 'role', 'verified', 'offset'].forEach(key => next.delete(key));
      return next;
    });
  };
  const activeFilterCount = ['q', 'status', 'role', 'verified']
    .filter(key => Boolean(params.get(key))).length;
  const hasFilters = activeFilterCount > 0;

  const columns: AdminDataColumn<AdminUserListItem>[] = [
    {
      key: 'user',
      header: 'Người dùng',
      render: user => (
        <div className="min-w-64">
          <Link
            to={`/admin/users/${encodeURIComponent(user.id)}`}
            state={{ from: `${location.pathname}${location.search}` }}
            className="font-semibold text-[var(--admin-accent)]"
          >
            {user.displayName ?? user.email}
          </Link>
          {!user.displayName && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Tên hiển thị chưa được ghi nhận
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--text-muted)]">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Quyền',
      render: user => (
        <div>
          {user.primaryRole
            ? <AdminStatusBadge status={user.primaryRole} label={roleLabel(user.primaryRole)} />
            : <AdminStatusBadge status="unassigned" label="Chưa có quyền" />}
          {user.roles.length > 1 && (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {user.roles.map(roleLabel).join(', ')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: user => (
        <AdminStatusBadge
          status={user.status}
          label={user.status === 'deleted' ? 'Đã xóa (trạng thái DB)' : undefined}
        />
      ),
    },
    {
      key: 'verification',
      header: 'Xác thực email',
      render: user => (
        <AdminStatusBadge
          status={user.emailVerified ? 'active' : 'pending'}
          label={user.emailVerified ? 'Đã ghi nhận' : 'Chưa ghi nhận'}
        />
      ),
    },
    {
      key: 'createdAt',
      header: 'Tạo lúc',
      render: user => (
        <time dateTime={user.createdAt} className="whitespace-nowrap text-xs text-[var(--text-muted)]">
          {new Date(user.createdAt).toLocaleDateString('vi-VN')}
        </time>
      ),
    },
    {
      key: 'lastActivity',
      header: 'Hoạt động học gần nhất',
      render: user => user.lastMeaningfulActivityAt
        ? (
          <time dateTime={user.lastMeaningfulActivityAt} className="whitespace-nowrap text-xs text-[var(--text-muted)]">
            {new Date(user.lastMeaningfulActivityAt).toLocaleDateString('vi-VN')}
          </time>
        )
        : <span className="text-xs text-[var(--text-muted)]">Chưa có hoạt động</span>,
    },
  ];

  const sortValue = `${state.sortBy}:${state.sortDir}`;

  return (
    <AdminLayout title="Người dùng">
      <AdminPageHeader
        title="Người dùng"
        description="Danh sách tài khoản ở chế độ chỉ đọc với quyền, trạng thái và hoạt động được lấy từ dữ liệu hệ thống."
      />

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--admin-shadow)]">
        <div className="space-y-3 border-b border-[var(--border)] p-4 sm:p-5">
          <AdminSearchInput
            value={search}
            onChange={event => setSearch(event.target.value)}
            onSubmit={() => {
              const value = search.trim();
              setParams(previous => {
                const next = new URLSearchParams(previous);
                if (value) next.set('q', value); else next.delete('q');
                next.delete('offset');
                return next;
              });
            }}
            placeholder="Tìm theo tên hoặc email..."
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <AdminFilterSelect value={params.get('status') ?? ''} onValueChange={value => setValue('status', value)} label="Trạng thái" options={options.status} />
            <AdminFilterSelect value={params.get('role') ?? ''} onValueChange={value => setValue('role', value)} label="Quyền" options={options.role} />
            <AdminFilterSelect value={params.get('verified') ?? ''} onValueChange={value => setValue('verified', value)} label="Xác thực email" options={options.verified} />
            <AdminFilterSelect value={sortValue} onValueChange={setSort} label="Sắp xếp" options={options.sort} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>{search.trim() !== urlQuery ? 'Đang tìm…' : `${total} tài khoản`}</span>
            <span aria-live="polite">
              {activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang dùng` : 'Chưa áp dụng bộ lọc'}
            </span>
            {hasFilters && <button type="button" onClick={clearFilters} className="admin-text-button">Xóa bộ lọc</button>}
          </div>
        </div>

        <AdminDataTable
          columns={columns}
          rows={items}
          getKey={user => user.id}
          minWidth="980px"
          loading={loading}
          error={error || undefined}
          onRetry={() => setRetry(value => value + 1)}
          emptyTitle="Không tìm thấy tài khoản"
          emptyDescription="Thử thay đổi từ khóa hoặc bộ lọc để tìm dữ liệu khác."
          footer={<AdminPagination total={total} offset={state.offset} limit={state.limit} loading={loading} onChange={offset => {
            setParams(previous => {
              const next = new URLSearchParams(previous);
              if (offset > 0) next.set('offset', String(offset)); else next.delete('offset');
              return next;
            });
          }} />}
        />
      </section>
    </AdminLayout>
  );
}
