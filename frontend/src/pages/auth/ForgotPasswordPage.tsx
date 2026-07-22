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
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccess(res.message || 'Hướng dẫn đặt lại mật khẩu đã được gửi về mail của bạn.');
    } catch {
      setError('Không thể gửi hướng dẫn đặt lại mật khẩu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Heading — trust & calm museum style */}
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '4rem',
            height: '4rem',
            borderRadius: '1rem',
            background: '#fef2f2',
            border: '1px solid rgba(139,30,30,0.15)',
            color: '#8b1e1e',
            marginBottom: '1rem',
          }}
        >
          <KeyRound size={30} strokeWidth={1.8} />
        </div>
        <h1
          className="font-sans text-2xl font-bold text-stone-900"
          style={{ marginBottom: '0.5rem', letterSpacing: '-0.01em' }}
        >
          Quên mật khẩu
        </h1>
        <p className="text-sm text-stone-500 max-w-xs mx-auto leading-relaxed">
          Nhập email đã đăng ký để nhận hướng dẫn đặt lại mật khẩu.
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}

      {success ? (
        <div className="animate-fade-in">
          <div
            style={{
              textAlign: 'center',
              padding: '1.5rem',
              background: '#fef2f2',
              border: '1px solid rgba(139,30,30,0.15)',
              borderRadius: '0.875rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ color: '#8b1e1e', display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <Inbox size={36} strokeWidth={1.8} />
            </div>
            <p className="text-sm text-stone-700 leading-relaxed">
              Vui lòng kiểm tra hộp thư của bạn
              <br />
              <span className="font-semibold" style={{ color: '#8b1e1e' }}>{email}</span>
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
              background: '#8b1e1e',
              borderRadius: '0.75rem',
              color: '#ffffff',
              fontSize: '0.9375rem',
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
              boxShadow: '0 2px 12px rgba(139,30,30,0.2)',
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
            {loading ? <RefreshCw size={18} strokeWidth={2} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Send size={18} strokeWidth={2} />}
            {loading ? 'Đang gửi...' : 'Gửi hướng dẫn đặt lại'}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: '#78716c', textDecoration: 'none' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#8b1e1e')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#78716c')}
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
