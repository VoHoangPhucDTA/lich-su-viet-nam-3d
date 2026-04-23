import { useState } from 'react';
import AdminLayout from '../../layouts/AdminLayout';
import AdminTable from '../../components/admin/AdminTable';
import UserStatusBadge from '../../components/admin/UserStatusBadge';
import RoleBadge from '../../components/shared/RoleBadge';
import { MOCK_ADMIN_USERS, type AdminUser, type AdminUserStatus, type AdminUserRole } from '../../data/mockAdminData';

/* ─── Filter button ──────────────────────────────────────────────────────────── */
function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.45rem 1rem',
        borderRadius: '9999px',
        fontSize: '0.8rem',
        fontWeight: active ? 800 : 500,
        color: active ? 'var(--admin-accent)' : 'var(--text-muted)',
        background: active ? 'var(--admin-accent-soft)' : 'var(--bg-app)',
        border: active ? '1px solid var(--admin-accent)' : '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {children}
    </button>
  );
}

/* ─── Action button ──────────────────────────────────────────────────────────── */
function ActionBtn({ label, color = 'var(--admin-accent)', onClick }: { label: string; color?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.375rem 0.75rem',
        borderRadius: '0.5rem',
        fontSize: '0.72rem',
        fontWeight: 800,
        color: color,
        background: 'var(--bg-surface)',
        border: `1px solid ${color}`,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap' as const,
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {label}
    </button>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>(MOCK_ADMIN_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminUserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AdminUserStatus | 'all'>('all');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function toggleStatus(id: string) {
    setUsers(prev =>
      prev.map(u =>
        u.id === id ? { ...u, status: u.status === 'active' ? 'locked' : 'active' } : u
      )
    );
    const u = users.find(x => x.id === id);
    showToast(`${u?.status === 'active' ? 'Đã khóa' : 'Đã mở khóa'}: ${u?.fullName} (mock)`);
  }

  function toggleRole(id: string) {
    setUsers(prev =>
      prev.map(u =>
        u.id === id ? { ...u, role: u.role === 'student' ? 'admin' : 'student' } : u
      )
    );
    const u = users.find(x => x.id === id);
    showToast(`Đổi role: ${u?.fullName} → ${u?.role === 'student' ? 'Admin' : 'Học sinh'} (mock)`);
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchQ && matchRole && matchStatus;
  });

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');
  const formatActive = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AdminLayout title="Quản lý người dùng">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 999,
          padding: '1rem 1.5rem', borderRadius: '1rem',
          background: 'var(--success-soft)', border: '1px solid var(--success)',
          color: 'var(--success)', fontSize: '0.875rem', fontWeight: 700,
          backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          animation: 'slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          ✅ {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          👥 Quản lý người dùng
        </h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0, opacity: 0.8 }}>
          {MOCK_ADMIN_USERS.length} tài khoản đã đăng ký · {MOCK_ADMIN_USERS.filter(u => u.status === 'active').length} đang hoạt động
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.5rem',
          display: 'flex', flexDirection: 'column', gap: '1.25rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '1rem', pointerEvents: 'none' }}>
            🔍
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc email..."
            style={{
              width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem',
              background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: '0.75rem', color: 'var(--text-primary)', fontSize: '0.875rem',
              outline: 'none', fontFamily: 'inherit', transition: 'all 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '1.5rem' }}>
          {/* Role */}
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Role</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 'student', 'admin'] as const).map(v => (
                <FilterBtn key={v} active={roleFilter === v} onClick={() => setRoleFilter(v)}>
                  {v === 'all' ? 'Tất cả' : v === 'student' ? 'Học sinh' : 'Admin'}
                </FilterBtn>
              ))}
            </div>
          </div>
          {/* Status */}
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trạng thái</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 'active', 'locked'] as const).map(v => (
                <FilterBtn key={v} active={statusFilter === v} onClick={() => setStatusFilter(v)}>
                  {v === 'all' ? 'Tất cả' : v === 'active' ? 'Hoạt động' : 'Đã khóa'}
                </FilterBtn>
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Hiển thị <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> / {users.length} người dùng</span>
          <button style={{ color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }} onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); }}>Thiết lập lại</button>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1.25rem', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <AdminTable
          rows={filtered}
          getKey={u => u.id}
          emptyIcon="👥"
          emptyTitle="Không tìm thấy người dùng"
          columns={[
            {
              key: 'name', header: 'Họ tên', render: u => (
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.875rem', marginBottom: '0.2rem' }}>{u.fullName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{u.email}</div>
                </div>
              ),
            },
            { key: 'role', header: 'Role', render: u => <RoleBadge role={u.role} /> },
            {
              key: 'grade', header: 'Lớp / Trường', render: u => (
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{u.grade ? `Lớp ${u.grade}` : '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{u.school ?? '—'}</div>
                </div>
              ),
            },
            { key: 'status', header: 'Trạng thái', render: u => <UserStatusBadge status={u.status} /> },
            {
              key: 'dates', header: 'Tạo / Hoạt động', render: u => (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>📅 {formatDate(u.createdAt)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.8 }}>⏱ {formatActive(u.lastActive)}</div>
                </div>
              ),
            },
            {
              key: 'actions', header: 'Hành động', render: u => (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <ActionBtn label="Hồ sơ" color="var(--admin-accent)" onClick={() => showToast(`Xem hồ sơ: ${u.fullName} (mock)`)} />
                  <ActionBtn
                    label={u.status === 'active' ? 'Khóa' : 'Mở'}
                    color={u.status === 'active' ? 'var(--danger)' : 'var(--success)'}
                    onClick={() => toggleStatus(u.id)}
                  />
                    <ActionBtn
                      label={u.role === 'student' ? 'Role Admin' : 'Role HS'}
                      color="var(--admin-accent)"
                      onClick={() => toggleRole(u.id)}
                    />
                </div>
              ), width: '200px',
            },
          ]}
        />
      </div>
    </AdminLayout>
  );
}
