import { useState, useRef, useEffect, type ReactNode } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import UserAvatar from '../components/profile/UserAvatar';

/* ─── Nav items ──────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { to: '/admin/dashboard',  icon: '📊', label: 'Dashboard' },
  { to: '/admin/users',      icon: '👥', label: 'Quản lý người dùng' },
  { to: '/admin/events',     icon: '🗺️', label: 'Quản lý sự kiện' },
  { to: '/admin/questions',  icon: '❓', label: 'Quản lý câu hỏi' },
];

/* ─── Sidebar ────────────────────────────────────────────────────────────────── */
function AdminSidebar({ onClose }: { onClose?: () => void }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const name = currentUser?.fullName ?? 'Admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div
      style={{
        width: '15rem',
        height: '100%',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.25rem 0.75rem',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      {/* Admin identity */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.625rem 0.625rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          marginBottom: '0.75rem',
        }}
      >
        <UserAvatar fullName={name} avatarUrl={currentUser?.avatarUrl} size="md" />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <span
            style={{
              display: 'inline-block',
              marginTop: '0.2rem',
              padding: '1px 7px',
              borderRadius: '9999px',
              fontSize: '0.62rem',
              fontWeight: 800,
              background: 'rgba(194,155,75,0.16)',
              color: '#9c7333',
              border: '1px solid rgba(194,155,75,0.28)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
            }}
          >
            Admin
          </span>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.875rem',
              borderRadius: '0.625rem',
              fontSize: '0.855rem',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#9c7333' : 'var(--text-muted)',
              background: isActive ? 'rgba(194,155,75,0.14)' : 'transparent',
              border: isActive ? '1px solid rgba(194,155,75,0.22)' : '1px solid transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
            })}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (el.style.background === 'transparent') {
                el.style.background = 'var(--bg-app)';
                el.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (el.style.background !== 'rgba(194,155,75,0.14)') {
                el.style.background = 'transparent';
                el.style.color = 'var(--text-muted)';
              }
            }}
          >
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div style={{ borderTop: '1px solid var(--border)', margin: '0.75rem 0', opacity: 0.5 }} />

        {/* Back to learning */}
        <Link
          to="/profile/dashboard"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 0.875rem',
            borderRadius: '0.625rem',
            fontSize: '0.855rem',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
            (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-app)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)';
            (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
          }}
        >
          <span style={{ fontSize: '1rem' }}>🎓</span>
          <span>Trang học tập</span>
        </Link>

        <Link
          to="/"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 0.875rem',
            borderRadius: '0.625rem',
            fontSize: '0.855rem',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
            (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-app)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)';
            (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
          }}
        >
          <span style={{ fontSize: '1rem' }}>🌍</span>
          <span>Bản đồ</span>
        </Link>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '0.375rem 0', opacity: 0.5 }} />

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 0.875rem',
            borderRadius: '0.625rem',
            fontSize: '0.855rem',
            color: 'var(--danger)',
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s',
            width: '100%',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-app)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <span style={{ fontSize: '1rem' }}>🚪</span>
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}

/* ─── Top bar user area ──────────────────────────────────────────────────────── */
function AdminTopBarUser() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = currentUser?.fullName ?? 'Admin';

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
      <span
        style={{
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '0.65rem',
          fontWeight: 800,
          background: 'rgba(194,155,75,0.16)',
          color: '#9c7333',
          border: '1px solid rgba(194,155,75,0.28)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Admin
      </span>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0.2rem',
          borderRadius: '0.5rem',
        }}
      >
        <UserAvatar fullName={name} avatarUrl={currentUser?.avatarUrl} size="sm" />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            width: '12rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            overflow: 'hidden',
            boxShadow: 'var(--shadow)',
            zIndex: 100,
          }}
        >
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>{name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{currentUser?.email}</div>
          </div>
          <Link
            to="/profile/dashboard"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.625rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)',
              textDecoration: 'none', transition: 'background 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-app)';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)';
            }}
          >
            🎓 Trang học tập
          </Link>
          <button
            onClick={async () => { await logout(); navigate('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.625rem 1rem', fontSize: '0.8rem', color: 'var(--danger)',
              background: 'transparent', border: 'none', borderTop: '1px solid var(--border)',
              cursor: 'pointer', width: '100%', textAlign: 'left', fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-app)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
          >
            🚪 Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── AdminLayout ────────────────────────────────────────────────────────────── */
export default function AdminLayout({ children, title }: { children: ReactNode; title?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Topbar */}
      <header
        style={{
          height: '3.5rem',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1.25rem',
          gap: '1rem',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(p => !p)}
          className="admin-hamburger"
          style={{
            display: 'flex', flexDirection: 'column', gap: '4px',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px',
          }}
          aria-label="Menu"
        >
          {[...Array(3)].map((_, i) => (
            <span key={i} style={{ display: 'block', width: '18px', height: '2px', background: 'var(--text-muted)', borderRadius: '2px' }} />
          ))}
        </button>

        {/* Logo */}
        <Link to="/admin/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', flexShrink: 0 }}>
          <span style={{ fontSize: '1.16rem' }}>⚙️</span>
          <span
            style={{
              fontSize: '0.9rem', fontWeight: 800,
              background: 'linear-gradient(135deg, #c29b4b, #9c7333)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}
          >
            Admin Panel
          </span>
        </Link>

        {/* Page title */}
        {title && (
          <span
            style={{
              fontSize: '0.8rem', color: 'var(--text-muted)', paddingLeft: '0.75rem',
              borderLeft: '1px solid var(--border)', display: 'none',
              fontWeight: 600,
              opacity: 0.8,
            }}
            className="admin-page-title"
          >
            {title}
          </span>
        )}

        <div style={{ flex: 1 }} />
        <AdminTopBarUser />
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
          />
        )}

        {/* Sidebar */}
        <div className={`admin-sidebar-wrap ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
          <AdminSidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 1.25rem', maxWidth: '100%', background: 'var(--bg-app)' }}>
          <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .admin-hamburger { display: none !important; }
          .admin-sidebar-wrap {
            position: static !important;
            transform: none !important;
            z-index: auto !important;
            flex-shrink: 0;
            height: calc(100vh - 3.5rem) !important;
          }
          .admin-page-title { display: inline !important; }
        }
        @media (max-width: 1023px) {
          .admin-sidebar-wrap {
            position: fixed;
            left: 0;
            top: 3.5rem;
            bottom: 0;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            z-index: 45;
          }
          .admin-sidebar-wrap.admin-sidebar-open {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
