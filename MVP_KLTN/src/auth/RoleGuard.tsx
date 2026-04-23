import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { UserRole } from '../types/auth';

interface RoleGuardProps {
  requiredRole: UserRole;
  children: React.ReactNode;
}

/* ─── Loading spinner ──────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0f172a',
      }}
    >
      <div
        style={{
          width: '2.5rem',
          height: '2.5rem',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'rg-spin 0.7s linear infinite',
        }}
      />
      <style>{`@keyframes rg-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── 403 Forbidden page ──────────────────────────────────────────────────── */
function ForbiddenPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#080d1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: '28rem',
          width: '100%',
          textAlign: 'center',
          animation: 'rg-fadein 0.35s ease-out',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '6rem',
            height: '6rem',
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.1)',
            border: '2px solid rgba(239,68,68,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.75rem',
            margin: '0 auto 1.75rem',
          }}
        >
          🚫
        </div>

        {/* Code */}
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            color: '#ef4444',
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
          }}
        >
          Lỗi 403 — Không có quyền truy cập
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: '#f1f5f9',
            marginBottom: '0.875rem',
            lineHeight: 1.2,
          }}
        >
          Trang dành riêng cho Admin
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: '0.9rem',
            color: '#94a3b8',
            lineHeight: 1.65,
            marginBottom: '2rem',
          }}
        >
          Bạn không có quyền truy cập trang quản trị này.
          Trang chỉ dành cho tài khoản <strong style={{ color: '#fb923c' }}>Admin</strong>.
          Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/profile/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.375rem',
              borderRadius: '0.625rem',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '0.88')}
            onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '1')}
          >
            🎓 Trang cá nhân
          </Link>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.375rem',
              borderRadius: '0.625rem',
              background: 'rgba(71,85,105,0.25)',
              border: '1px solid rgba(71,85,105,0.35)',
              color: '#94a3b8',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(71,85,105,0.4)')}
            onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(71,85,105,0.25)')}
          >
            🌍 Về bản đồ
          </Link>
        </div>
      </div>
      <style>{`
        @keyframes rg-fadein {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── RoleGuard ───────────────────────────────────────────────────────────── */
export default function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) return <Spinner />;

  // ProtectedRoute already handles unauthenticated state; RoleGuard only handles role mismatch
  if (!currentUser) return null;

  if (currentUser.role !== requiredRole) {
    if (requiredRole === 'admin') {
      return <ForbiddenPage />;
    }
    // Admin visiting student-only pages → redirect to admin dashboard
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
}
