import { useState, useRef, useEffect, type ReactNode } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import UserAvatar from '../components/profile/UserAvatar';

/* ─── Nav items ─────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { to: '/profile/dashboard', icon: '📊', label: 'Tổng quan' },
  { to: '/profile/history',   icon: '📜', label: 'Lịch sử học tập' },
  { to: '/profile/scores',    icon: '🏆', label: 'Điểm số' },
  { to: '/quiz',              icon: '🤖', label: 'Trắc nghiệm AI' },
  { to: '/exams',             icon: '📝', label: 'Đề thi THPT' },
  { to: '/profile/settings',  icon: '⚙️', label: 'Cài đặt tài khoản' },
];


/* ─── Sidebar ────────────────────────────────────────────────────────────────── */
function Sidebar({ onClose }: { onClose?: () => void }) {
  const { currentUser } = useAuth();
  const name = currentUser?.fullName ?? 'Học sinh';

  return (
    <div
      style={{
        width: '15rem',
        height: '100%',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.25rem 0.75rem',
        gap: '0.25rem',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* User info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.625rem 0.625rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          marginBottom: '0.625rem',
        }}
      >
        <UserAvatar fullName={name} avatarUrl={currentUser?.avatarUrl} size="md" />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          {currentUser?.grade && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Lớp {currentUser.grade} · {currentUser.school ?? ''}
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
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
            fontSize: '0.875rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            background: isActive ? 'var(--accent-soft)' : 'transparent',
            border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
            textDecoration: 'none',
            transition: 'all 0.15s',
            cursor: 'pointer',
          })}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLAnchorElement;
            if (!el.classList.contains('active')) {
              el.style.background = 'var(--bg-app)';
              el.style.color = 'var(--text-primary)';
            }
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLAnchorElement;
            if (!el.classList.contains('active')) {
              el.style.background = 'transparent';
              el.style.color = 'var(--text-secondary)';
            }
          }}
        >
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}

      {/* Divider */}
      <div style={{ margin: '0.75rem 0', borderTop: '1px solid var(--border)' }} />

      {/* Back to map */}
      <Link
        to="/"
        onClick={onClose}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.625rem 0.875rem',
          borderRadius: '0.625rem',
          fontSize: '0.875rem',
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
        <span>Quay lại bản đồ</span>
      </Link>
    </div>
  );
}

/* ─── Avatar Dropdown ────────────────────────────────────────────────────────── */
function AvatarDropdown() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const name = currentUser?.fullName ?? 'Học sinh';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem',
          borderRadius: '0.5rem',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-app)')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
      >
        <UserAvatar fullName={name} avatarUrl={currentUser?.avatarUrl} size="sm" />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'none' }} className="md:inline">
          {name.split(' ').pop()}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
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
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{currentUser?.email}</div>
          </div>
          {[
            { icon: '👤', label: 'Hồ sơ',    to: '/profile/dashboard' },
            { icon: '⚙️', label: 'Cài đặt',  to: '/profile/settings' },
          ].map(item => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.625rem 1rem',
                fontSize: '0.825rem',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-app)')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'transparent')}
            >
              {item.icon} {item.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              padding: '0.625rem 1rem',
              fontSize: '0.825rem',
              color: 'var(--danger)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              borderTop: '1px solid var(--border)',
              transition: 'background 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-soft)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}
          >
            🚪 Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── ProfileLayout ──────────────────────────────────────────────────────────── */
export default function ProfileLayout({ children }: { children: ReactNode }) {
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
      {/* ── Topbar ── */}
      <header
        style={{
          height: '3.5rem',
          background: 'var(--bg-surface)',
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
        {/* Hamburger (mobile) */}
        <button
          onClick={() => setSidebarOpen(p => !p)}
          className="profile-hamburger"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '6px',
          }}
          aria-label="Menu"
        >
          {[...Array(3)].map((_, i) => (
            <span
              key={i}
              style={{
                display: 'block',
                width: '18px',
                height: '2px',
                background: 'var(--text-muted)',
                borderRadius: '2px',
              }}
            />
          ))}
        </button>

        {/* Logo */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🗺️</span>
          <span
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4f6f95, #2a4b72)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Lịch Sử Việt Nam 3D
          </span>
        </Link>

        <div style={{ flex: 1 }} />

        {/* Back to map */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.875rem',
            borderRadius: '0.5rem',
            background: 'var(--bg-app)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.8rem',
            fontWeight: 500,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'var(--accent-soft)';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-app)';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
          }}
        >
          <span>🌍</span>
          <span className="profile-map-label">Quay lại bản đồ</span>
        </Link>

        <AvatarDropdown />
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Mobile drawer overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 40,
            }}
          />
        )}

        {/* Sidebar wrapper: fixed drawer on mobile, static on desktop */}
        <div
          className={`profile-sidebar-wrap ${sidebarOpen ? 'profile-sidebar-open' : ''}`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '2rem 1.25rem',
            maxWidth: '100%',
          }}
        >
          <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>

      <style>{`
        /* Desktop: sidebar always visible */
        @media (min-width: 1024px) {
          .profile-hamburger { display: none !important; }
          .profile-sidebar-wrap {
            position: static !important;
            transform: none !important;
            z-index: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
