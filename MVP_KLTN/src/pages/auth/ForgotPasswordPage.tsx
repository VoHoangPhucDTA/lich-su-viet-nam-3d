import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';

import TextInput from '../../components/auth/TextInput';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccess(res.message);
    } catch {
      setError('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Icon */}
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
          🔑
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
          Quên mật khẩu
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '22rem', margin: '0 auto' }}>
          Nhập email bạn đã đăng ký để nhận hướng dẫn đặt lại mật khẩu
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}

      {success ? (
        <div className="animate-fade-in">
          <AuthFormMessage type="success" message={success} />

          {/* Visual success state */}
          <div
            style={{
              textAlign: 'center',
              padding: '1.5rem',
              background: 'var(--success)',
              opacity: 0.1,
              border: '1px solid var(--success)',
              borderRadius: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📬</div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              Kiểm tra hộp thư của bạn <br />
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{email}</span>
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              * Đây là demo — không có email thật được gửi
            </p>
          </div>

          <Link
            to="/login"
            style={{
              display: 'block',
              width: '100%',
              padding: '0.8125rem',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              border: 'none',
              borderRadius: '0.625rem',
              color: '#fff',
              fontSize: '0.9375rem',
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(99,102,241,0.35)',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.opacity = '0.9')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.opacity = '1')}
          >
            ← Quay lại đăng nhập
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <TextInput
            id="forgot-email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="Email đã đăng ký"
            required
            label="Địa chỉ email"
            icon="📧"
            autoComplete="email"
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.8125rem',
              background: loading
                ? 'var(--accent-soft)'
                : 'linear-gradient(135deg, #6366f1, #4f46e5)',
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
              boxShadow: loading ? 'none' : '0 4px 15px rgba(99,102,241,0.35)',
              fontFamily: 'inherit',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
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
            {loading ? 'Đang gửi...' : 'Gửi hướng dẫn đặt lại'}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link
              to="/login"
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                textDecoration: 'none',
                transition: 'color 0.2s',
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
