import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';
import PasswordInput from '../../components/auth/PasswordInput';
import OAuthButtons from '../../components/auth/OAuthButtons';
import * as authService from '../../services/authService';

import TextInput from '../../components/auth/TextInput';

/* ─── Submit button ──────────────────────────────────────────────────────── */
function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        padding: '0.8125rem',
        background: loading
          ? 'var(--accent-soft)'
          : 'var(--accent)',
        border: 'none',
        borderRadius: '0.625rem',
        color: '#fff',
        fontSize: '0.9375rem',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        transition: 'all 0.2s',
        boxShadow: loading ? 'none' : '0 4px 15px rgba(99,102,241,0.2)',
        fontFamily: 'inherit',
        letterSpacing: '0.01em',
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.filter = 'none';
        (e.currentTarget as HTMLButtonElement).style.transform = 'none';
      }}
    >
      {loading && (
        <span
          style={{
            width: '1.125rem',
            height: '1.125rem',
            border: '2px solid rgba(255,255,255,0.4)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      )}
      {loading ? 'Đang xử lý...' : label}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

/* ─── LoginPage ─────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Vui lòng nhập email.'); return; }
    if (!password) { setError('Vui lòng nhập mật khẩu.'); return; }
    setError('');
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      const stored = authService.loadFromStorage();
      const role = stored?.user?.role ?? 'student';
      navigate(role === 'admin' ? '/admin/dashboard' : '/profile/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Title */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '0.375rem',
            letterSpacing: '-0.01em',
          }}
        >
          Đăng nhập
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Chào mừng trở lại! Tiếp tục hành trình học sử.
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}

      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <TextInput
          id="login-email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="student@demo.com"
          required
          label="Email"
          icon="📧"
          autoComplete="email"
        />

        <PasswordInput
          id="login-password"
          value={password}
          onChange={setPassword}
          placeholder="Mật khẩu của bạn"
          required
          autoComplete="current-password"
          label="Mật khẩu"
        />

        {/* Remember + Forgot */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              id="remember-me"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '1rem', height: '1rem' }}
            />
            Ghi nhớ đăng nhập
          </label>
          <Link
            to="/forgot-password"
            style={{
              fontSize: '0.875rem',
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: 600,
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)')}
          >
            Quên mật khẩu?
          </Link>
        </div>

        <div style={{ marginTop: '0.25rem' }}>
          <SubmitButton loading={loading} label="Đăng nhập" />
        </div>
      </form>

      {/* Hint about demo accounts */}
      <div
        style={{
          marginTop: '0.875rem',
          padding: '0.625rem 0.875rem',
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent)',
          opacity: 0.8,
          borderRadius: '0.5rem',
          fontSize: '0.75rem',
          color: 'var(--accent)',
          lineHeight: 1.6,
        }}
      >
        🧪 <strong>Demo:</strong> student@demo.com / 123456 &nbsp;|&nbsp; admin@demo.com / admin123
      </div>

      <OAuthButtons onError={setError} />

      {/* Footer link */}
      <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
        Chưa có tài khoản?{' '}
        <Link
          to="/register"
          style={{
            color: 'var(--accent)',
            textDecoration: 'none',
            fontWeight: 600,
            transition: 'color 0.2s',
          }}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)')}
        >
          Đăng ký ngay
        </Link>
      </p>
    </AuthLayout>
  );
}
