import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import UserAvatar from '../components/profile/UserAvatar';

type AdminNavItem = { to: string; label: string; icon: LucideIcon };

const NAV_ITEMS: AdminNavItem[] = [
  { to: '/admin/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/admin/events', label: 'Sự kiện lịch sử', icon: CalendarDays },
  { to: '/admin/users', label: 'Người dùng', icon: Users },
  { to: '/admin/exams/ai-candidates', label: 'Duyệt câu hỏi AI', icon: Sparkles },
];

function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const name = currentUser?.fullName ?? 'Admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Đóng menu quản trị"
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,25,23,0.3)' }}
          className="lg:hidden"
        />
      )}
      <aside
        style={{
          width: 'var(--admin-sidebar-width)',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-card)',
          boxShadow: 'var(--admin-shadow)',
        }}
        className={[
          'fixed inset-y-0 left-0 z-50 flex flex-col',
          'transition-transform duration-200',
          'lg:translate-x-0 admin-sidebar-fixed-desktop',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-16 items-center justify-between px-5 lg:hidden" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Quản trị</span>
          <button type="button" onClick={onClose} aria-label="Đóng menu quản trị" className="admin-icon-button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <UserAvatar fullName={name} avatarUrl={currentUser?.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--admin-accent)' }}>Admin</p>
            </div>
          </div>
        </div>
        <nav aria-label="Điều hướng quản trị" className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Quản trị</p>
          <div className="space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => ['admin-nav-item', isActive ? 'admin-nav-item-active' : ''].filter(Boolean).join(' ')}>
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
          <div className="my-5" style={{ borderTop: '1px solid var(--border)' }} />
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Liên kết</p>
          <div className="space-y-1">
            <Link to="/profile/dashboard" onClick={onClose} className="admin-nav-item">
              <GraduationCap size={17} strokeWidth={1.8} aria-hidden="true" /><span>Trang học tập</span>
            </Link>
            <Link to="/map" onClick={onClose} className="admin-nav-item">
              <Map size={17} strokeWidth={1.8} aria-hidden="true" /><span>Bản đồ</span>
            </Link>
          </div>
        </nav>
        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={() => void handleLogout()} className="admin-nav-item w-full text-left" style={{ color: 'var(--accent)' }}>
            <LogOut size={17} strokeWidth={1.8} aria-hidden="true" /><span>Đăng xuất</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default function AdminLayout({ children }: { children: ReactNode; title?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="admin-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main id="admin-main-content" className="admin-main-offset" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <button type="button" aria-label="Mở menu quản trị" onClick={() => setSidebarOpen(true)} className="admin-mobile-menu-toggle admin-icon-button lg:hidden">
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="admin-content-wrapper">{children}</div>
        </main>
      </div>
    </div>
  );
}
