import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';
import PasswordInput from '../../components/auth/PasswordInput';
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter';

function isStrongPassword(password: string) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const token = searchParams.get('token') ?? '';
    if (!token) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ.');
      return;
    }
    if (!isStrongPassword(password)) {
      setError('Mật khẩu phải có ít nhất 8 ký tự, chữ hoa, chữ thường, số và ký tự đặc biệt.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword({ token, newPassword: password });
      setSuccess(res.message || 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '4rem',
            height: '4rem',
            borderRadius: '1rem',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            marginBottom: '1rem',
          }}
        >
          <ShieldCheck size={32} strokeWidth={2} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem', letterSpacing: '-0.01em' }}>
          Đặt lại mật khẩu
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Tạo mật khẩu mới an toàn cho tài khoản của bạn.
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}
      {success && <AuthFormMessage type="success" message={success} />}

      {success ? (
        <div className="animate-fade-in" style={{ textAlign: 'center' }}>
          <div
            style={{
              padding: '1.5rem',
              background: 'rgba(47,122,87,0.12)',
              border: '1px solid rgba(47,122,87,0.35)',
              borderRadius: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ color: 'var(--accent)', display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <CheckCircle2 size={38} strokeWidth={2} />
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--success)', fontWeight: 600 }}>
              Mật khẩu đã được đặt lại thành công.
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
              Đang chuyển về trang đăng nhập...
            </p>
          </div>
          <Link
            to="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 2rem',
              background: 'var(--accent)',
              borderRadius: '0.625rem',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9375rem',
              boxShadow: '0 4px 15px rgba(30,58,95,0.25)',
            }}
          >
            <ArrowLeft size={18} strokeWidth={2} />
            Đăng nhập ngay
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <PasswordInput
              id="reset-password"
              value={password}
              onChange={setPassword}
              placeholder="Mật khẩu mới"
              required
              autoComplete="new-password"
              label="Mật khẩu mới"
              hint="Có chữ hoa, chữ thường, số và ký tự đặc biệt"
            />
            <PasswordStrengthMeter password={password} />
          </div>

          <PasswordInput
            id="reset-confirm"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Nhập lại mật khẩu mới"
            required
            autoComplete="new-password"
            label="Nhập lại mật khẩu"
          />

          {confirmPassword && (
            <p
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: confirmPassword === password ? 'var(--success)' : 'var(--danger)',
                marginTop: '-0.5rem',
              }}
            >
              {confirmPassword === password ? <CheckCircle2 size={15} strokeWidth={2} /> : <CircleAlert size={15} strokeWidth={2} />}
              {confirmPassword === password ? 'Mật khẩu khớp' : 'Mật khẩu chưa khớp'}
            </p>
          )}

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
              boxShadow: loading ? 'none' : '0 4px 15px rgba(30,58,95,0.2)',
              fontFamily: 'inherit',
              marginTop: '0.25rem',
            }}
          >
            {loading && <RefreshCw size={18} strokeWidth={2} style={{ animation: 'spin 0.7s linear infinite' }} />}
            {loading ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <Link
              to="/login"
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <ArrowLeft size={16} strokeWidth={2} />
              Quay lại đăng nhập
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
