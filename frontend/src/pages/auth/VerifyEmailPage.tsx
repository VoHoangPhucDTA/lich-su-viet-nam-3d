import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { useAuth } from '../../auth/AuthContext';

type VerifyState = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();
  const [state, setState] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('Đang xác minh tài khoản...');
  const [redirectSeconds, setRedirectSeconds] = useState(3);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('Link xác minh không hợp lệ hoặc thiếu token.');
      return;
    }

    let cancelled = false;
    let redirectTimer: number | undefined;
    let countdownTimer: number | undefined;

    verifyEmail(token)
      .then((result) => {
        if (cancelled) return;
        setState('success');
        setMessage(result.message || 'Email đã được xác minh.');

        setRedirectSeconds(3);
        countdownTimer = window.setInterval(() => {
          setRedirectSeconds((value) => Math.max(0, value - 1));
        }, 1000);
        redirectTimer = window.setTimeout(() => {
          if (!cancelled) navigate('/', { replace: true });
        }, 3000);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState('error');
        setMessage(err instanceof Error ? err.message : 'Link xác minh không hợp lệ hoặc đã hết hạn.');
      });

    return () => {
      cancelled = true;
      if (redirectTimer) window.clearTimeout(redirectTimer);
      if (countdownTimer) window.clearInterval(countdownTimer);
    };
  }, [navigate, params, verifyEmail]);

  const isSuccess = state === 'success';

  return (
    <AuthLayout>
      <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
        <div
          style={{
            width: '3.25rem',
            height: '3.25rem',
            margin: '0 auto 1rem',
            borderRadius: '999px',
            background: isSuccess ? 'var(--accent-soft)' : 'var(--input-bg)',
            color: isSuccess ? 'var(--accent)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {state === 'loading' && <Loader2 size={28} strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }} />}
          {state === 'success' && <CheckCircle size={30} strokeWidth={2} />}
          {state === 'error' && <AlertCircle size={30} strokeWidth={2} />}
        </div>

        <h1
          style={{
            fontSize: '1.5rem',
            color: 'var(--text-primary)',
            margin: '0 0 0.5rem',
          }}
        >
          {state === 'loading' ? 'Đang xác minh' : isSuccess ? 'Xác minh thành công' : 'Không thể xác minh'}
        </h1>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 1.25rem' }}>{message}</p>

        {isSuccess ? (
          <p
            style={{
              color: 'var(--accent)',
              fontWeight: 700,
              margin: 0,
            }}
          >
            Đang chuyển về trang chủ sau {redirectSeconds}s...
          </p>
        ) : (
          <Link
            to="/register"
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '0.8125rem',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '0.625rem',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Quay lại đăng ký
          </Link>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AuthLayout>
  );
}
