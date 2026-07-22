import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';
import OAuthButtons from '../../components/auth/OAuthButtons';
import TextInput from '../../components/auth/TextInput';
import PasswordInput from '../../components/auth/PasswordInput';
import { ApiRequestError } from '../../services/apiClient';

function SubmitButton({ loading }: { loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        padding: '0.8125rem',
        background: loading ? '#fef2f2' : '#8b1e1e',
        border: 'none',
        borderRadius: '0.75rem',
        color: loading ? '#8b1e1e' : '#ffffff',
        fontSize: '0.9375rem',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        transition: 'all 0.2s',
        boxShadow: loading ? 'none' : '0 2px 12px rgba(139,30,30,0.2)',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          (e.currentTarget as HTMLButtonElement).style.background = '#6b1616';
        }
      }}
      onMouseLeave={(e) => {
        if (!loading) {
          (e.currentTarget as HTMLButtonElement).style.background = '#8b1e1e';
        }
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
      const result = await login({ email: email.trim(), password });
      const role = result?.user?.role ?? 'student';
      navigate(role === 'admin' ? '/admin/dashboard' : '/home', { replace: true });
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Heading */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1
          className="font-sans text-2xl font-bold text-stone-900"
          style={{ marginBottom: '0.25rem', letterSpacing: '-0.01em' }}
        >
          Đăng nhập
        </h1>
        <p className="text-sm text-stone-500">
          Chào mừng trở lại với Bảo tàng số Lịch sử Việt Nam
        </p>
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
              color: '#57534e',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              id="remember-me"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: '#8b1e1e', cursor: 'pointer', width: '1rem', height: '1rem' }}
            />
            Ghi nhớ đăng nhập
          </label>
          <Link
            to="/forgot-password"
            className="text-sm font-semibold hover:underline transition-colors"
            style={{ color: '#8b1e1e', textDecoration: 'none' }}
          >
            Quên mật khẩu?
          </Link>
        </div>

        <div style={{ marginTop: '0.25rem' }}>
          <SubmitButton loading={loading} />
        </div>
      </form>

      <OAuthButtons mode="login" onError={setError} />

      <p className="text-center text-sm text-stone-500 mt-5">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="font-semibold hover:underline transition-colors" style={{ color: '#8b1e1e', textDecoration: 'none' }}>
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
