import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import UserAvatar from '../components/profile/UserAvatar';

type AdminNavItem = { to: string; label: string; icon: LucideIcon; adminOnly?: boolean };

const NAV_ITEMS: AdminNavItem[] = [
  { to: '/admin/dashboard', label: 'Tổng quan', icon: LayoutDashboard, adminOnly: true },
  { to: '/admin/events', label: 'Sự kiện lịch sử', icon: CalendarDays, adminOnly: true },
  { to: '/admin/users', label: 'Người dùng', icon: Users, adminOnly: true },
];

function AdminSidebar({
  open,
  onClose,
  invokerRef,
}: {
  open: boolean;
  onClose: () => void;
  invokerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const name = currentUser?.fullName ?? 'Admin';
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const invoker = invokerRef.current;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      invoker?.focus();
    };
  }, [invokerRef, onClose, open]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,25,23,0.3)' }}
          className="lg:hidden"
        />
      )}
      <aside
        ref={sidebarRef}
        aria-label="Menu quản trị"
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
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng menu quản trị" className="admin-icon-button">
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
            {NAV_ITEMS.filter(item => !item.adminOnly || currentUser?.role === 'admin').map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => ['admin-nav-item', isActive ? 'admin-nav-item-active' : ''].filter(Boolean).join(' ')}>
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="admin-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg-app)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <AdminSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          invokerRef={menuButtonRef}
        />
        <main
          id="admin-main-content"
          className="admin-main-offset"
          inert={sidebarOpen}
          style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}
        >
          <button ref={menuButtonRef} type="button" aria-label="Mở menu quản trị" onClick={() => setSidebarOpen(true)} className="admin-mobile-menu-toggle admin-icon-button lg:hidden">
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="admin-content-wrapper">{children}</div>
        </main>
      </div>
    </div>
  );
}
