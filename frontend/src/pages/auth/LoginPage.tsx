import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';
import OAuthButtons from '../../components/auth/OAuthButtons';
import TextInput from '../../components/auth/TextInput';
import PasswordInput from '../../components/auth/PasswordInput';
import * as authService from '../../services/authService';
import { ApiRequestError } from '../../services/apiClient';

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        padding: '0.8125rem',
        background: loading ? 'var(--accent-soft)' : 'var(--accent)',
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
        boxShadow: loading ? 'none' : '0 4px 15px rgba(30,58,95,0.2)',
        fontFamily: 'inherit',
      }}
    >
      {loading ? (
        <RefreshCw size={18} strokeWidth={2} style={{ animation: 'spin 0.7s linear infinite' }} />
      ) : (
        <LogIn size={18} strokeWidth={2} />
      )}
      {loading ? 'Đang xử lý...' : 'Đăng nhập'}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

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
    if (!email.trim()) {
      setError('Vui lòng nhập email.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      const stored = authService.loadFromStorage();
      const role = stored?.user?.role ?? 'student';
      navigate(role === 'admin' ? '/admin/dashboard' : '/', { replace: true });
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
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
      </div>

      {error && <AuthFormMessage type="error" message={error} />}

      <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <TextInput
          id="login-email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="Email"
          label="Email"
          icon={Mail}
          autoComplete="email"
          required
        />

        <PasswordInput
          id="login-password"
          label="Mật khẩu"
          value={password}
          onChange={setPassword}
          placeholder="Mật khẩu"
          autoComplete="current-password"
          required
        />

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
            }}
          >
            Quên mật khẩu?
          </Link>
        </div>

        <div style={{ marginTop: '0.25rem' }}>
          <SubmitButton loading={loading} />
        </div>
      </form>

      <OAuthButtons mode="login" onError={setError} />

      <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
        Chưa có tài khoản?{' '}
        <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
          Đăng ký ngay
        </Link>
      </p>
    </AuthLayout>
  );
}

function authErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.code === 'EMAIL_NOT_VERIFIED') return 'Vui lòng xác minh email trước khi đăng nhập.';
    if (error.code === 'ACCOUNT_LOCKED') return 'Tài khoản đang bị khóa tạm thời do đăng nhập sai quá nhiều lần.';
    if (error.code === 'INVALID_CREDENTIALS') return 'Email hoặc mật khẩu không đúng.';
  }
  return error instanceof Error ? error.message : 'Đăng nhập thất bại.';
}
