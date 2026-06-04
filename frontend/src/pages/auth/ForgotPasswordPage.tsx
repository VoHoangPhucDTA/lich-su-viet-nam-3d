import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Inbox, KeyRound, Mail, RefreshCw, Send } from 'lucide-react';
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
    // Bước 6C.1.1: ForgotPasswordPage.tsx: Nhập email và nhấn nút Gửi
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Bước 6C.1.2: ForgotPasswordPage.tsx: gọi hàm forgotPassword trong authService.ts
      const res = await forgotPassword(email.trim());
      // Bước 6C.1.11: ForgotPasswordPage.tsx: hiển thị thông báo thành công
      setSuccess(res.message || 'Hướng dẫn đặt lại mật khẩu đã được gửi về mail của bạn.');
    } catch {
      setError('Không thể gửi hướng dẫn đặt lại mật khẩu. Vui lòng thử lại.');
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
          <KeyRound size={30} strokeWidth={2} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem', letterSpacing: '-0.01em' }}>
          Quên mật khẩu
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '22rem', margin: '0 auto', lineHeight: 1.6 }}>
          Nhập email đã đăng ký để nhận hướng dẫn đặt lại mật khẩu.
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}

      {success ? (
        <div className="animate-fade-in">
          <AuthFormMessage type="success" message={success} />

          <div
            style={{
              textAlign: 'center',
              padding: '1.5rem',
              background: 'rgba(47,122,87,0.12)',
              border: '1px solid rgba(47,122,87,0.35)',
              borderRadius: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ color: 'var(--accent)', display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <Inbox size={36} strokeWidth={2} />
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              Vui lòng kiểm tra hộp thư của bạn
              <br />
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{email}</span>
            </p>
          </div>

          <Link
            to="/login"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.8125rem',
              background: 'var(--accent)',
              borderRadius: '0.625rem',
              color: '#fff',
              fontSize: '0.9375rem',
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(30,58,95,0.25)',
            }}
          >
            <ArrowLeft size={18} strokeWidth={2} />
            Quay lại đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <TextInput
            id="forgot-email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="Email đã đăng ký"
            required
            label="Địa chỉ email"
            icon={Mail}
            autoComplete="email"
          />

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
            }}
          >
            {loading ? <RefreshCw size={18} strokeWidth={2} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Send size={18} strokeWidth={2} />}
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
