import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';
import PasswordInput from '../../components/auth/PasswordInput';

/* Password strength indicator */
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  let strength = 0;
  if (password.length >= 6) strength++;
  if (password.length >= 10) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  const levels = [
    { label: 'Rất yếu', color: 'var(--danger)', width: '20%' },
    { label: 'Yếu', color: 'var(--warning)', width: '40%' },
    { label: 'Trung bình', color: 'var(--warning)', width: '60%' },
    { label: 'Mạnh', color: 'var(--success)', width: '80%' },
    { label: 'Rất mạnh', color: 'var(--success)', width: '100%' },
  ];

  const idx = Math.max(0, Math.min(strength - 1, 4));
  const level = levels[idx];

  return (
    <div style={{ marginTop: '0.375rem' }}>
      <div
        style={{
          height: '3px',
          background: 'var(--border)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: level.width,
            background: level.color,
            borderRadius: '2px',
            transition: 'width 0.3s ease, background 0.3s ease',
          }}
        />
      </div>
      <p style={{ fontSize: '0.6875rem', color: level.color, marginTop: '0.25rem', fontWeight: 600 }}>
        {level.label}
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(password);
      setSuccess(res.message);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Icon + Title */}
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
            fontSize: '2rem',
            marginBottom: '1rem',
          }}
        >
          🔒
        </div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '0.375rem',
            letterSpacing: '-0.01em',
          }}
        >
          Đặt lại mật khẩu
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Tạo mật khẩu mới an toàn cho tài khoản của bạn
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}
      {success && <AuthFormMessage type="success" message={success} />}

      {success ? (
        /* Success state */
        <div className="animate-fade-in" style={{ textAlign: 'center' }}>
          <div
            style={{
              padding: '1.5rem',
              background: 'var(--success)',
              opacity: 0.1,
              border: '1px solid var(--success)',
              borderRadius: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
            <p style={{ fontSize: '0.875rem', color: 'var(--success)', fontWeight: 600 }}>
              Mật khẩu đã được đặt lại thành công!
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
              Đang chuyển về trang đăng nhập...
            </p>
          </div>
          <Link
            to="/login"
            style={{
              display: 'inline-block',
              padding: '0.75rem 2rem',
              background: 'var(--accent)',
              borderRadius: '0.625rem',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9375rem',
              boxShadow: '0 4px 15px rgba(30,58,95,0.25)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
          >
            Đăng nhập ngay
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div>
            <PasswordInput
              id="reset-password"
              value={password}
              onChange={setPassword}
              placeholder="Mật khẩu mới"
              required
              autoComplete="new-password"
              label="Mật khẩu mới"
              hint="Ít nhất 6 ký tự"
            />
            <PasswordStrength password={password} />
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

          {/* Match indicator */}
          {confirmPassword && (
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: confirmPassword === password ? 'var(--success)' : 'var(--danger)',
                marginTop: '-0.5rem',
              }}
            >
              {confirmPassword === password ? '✓ Mật khẩu khớp' : '✗ Mật khẩu chưa khớp'}
            </p>
          )}

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
              boxShadow: loading ? 'none' : '0 4px 15px rgba(30,58,95,0.2)',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
              marginTop: '0.25rem',
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
                transition: 'color 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')}
            >
              ← Quay lại đăng nhập
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
