import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';
import OAuthButtons from '../../components/auth/OAuthButtons';
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter';
import TextInput from '../../components/auth/TextInput';
import PasswordInput from '../../components/auth/PasswordInput';
import type { RegisterResponse } from '../../types/auth';

function SubmitButton({ loading, disabled }: { loading: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: '100%',
        padding: '0.8125rem',
        background: disabled ? '#fef2f2' : '#8b1e1e',
        border: 'none',
        borderRadius: '0.75rem',
        color: disabled ? '#8b1e1e' : '#ffffff',
        fontSize: '0.9375rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        transition: 'all 0.2s',
        boxShadow: disabled ? 'none' : '0 2px 12px rgba(139,30,30,0.2)',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = '#6b1616';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = '#8b1e1e';
        }
      }}
    >
      {loading && <RefreshCw size={18} strokeWidth={2} aria-hidden="true" style={{ animation: 'spin 0.7s linear infinite' }} />}
      {loading ? 'Đang tạo...' : 'Tạo tài khoản'}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

function isStrongPassword(password: string) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function passwordStrengthMessage(password: string) {
  if (password.length < 8) return 'Mật khẩu cần có ít nhất 8 ký tự.';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu cần có ít nhất 1 chữ hoa.';
  if (!/[a-z]/.test(password)) return 'Mật khẩu cần có ít nhất 1 chữ thường.';
  if (!/[0-9]/.test(password)) return 'Mật khẩu cần có ít nhất 1 chữ số.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Mật khẩu cần có ít nhất 1 ký tự đặc biệt.';
  return '';
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = Math.max(0, seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function secondsUntil(timestamp: string) {
  return Math.max(0, Math.ceil((new Date(timestamp).getTime() - Date.now()) / 1000));
}

export default function RegisterPage() {
  const { register, resendVerification } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordStrengthError, setShowPasswordStrengthError] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<RegisterResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  const formLocked = loading || pendingVerification !== null;

  useEffect(() => {
    if (!pendingVerification) return undefined;
    setSecondsLeft(secondsUntil(pendingVerification.verificationExpiresAt));
    const timer = window.setInterval(() => {
      setSecondsLeft(secondsUntil(pendingVerification.verificationExpiresAt));
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pendingVerification]);

  const countdownText = useMemo(() => formatCountdown(secondsLeft), [secondsLeft]);
  const passwordPolicyError = showPasswordStrengthError ? passwordStrengthMessage(password) : '';

  const confirmPasswordError =
    confirmTouched && password.length > 0 && confirmPassword !== password
      ? 'Mật khẩu nhập lại không khớp.'
      : '';

  const validate = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Email không hợp lệ.';
    }
    if (!isStrongPassword(password)) {
      setShowPasswordStrengthError(true);
      return 'Mật khẩu phải có ít nhất 8 ký tự, chữ hoa, chữ thường, số và ký tự đặc biệt.';
    }
    if (password !== confirmPassword) {
      return 'Mật khẩu nhập lại không khớp.';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingVerification) return;

    setShowPasswordStrengthError(true);
    setConfirmTouched(true);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await register({ email: email.trim(), password });
      setPendingVerification(result);
      setSecondsLeft(secondsUntil(result.verificationExpiresAt));
      setResendCooldown(60);
      setSuccess('Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingVerification || resendCooldown > 0) return;
    setError('');
    setResending(true);
    try {
      const result = await resendVerification(pendingVerification.email);
      setPendingVerification(result);
      setSecondsLeft(secondsUntil(result.verificationExpiresAt));
      setResendCooldown(60);
      setSuccess('Đã gửi lại link xác minh. Vui lòng kiểm tra email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không gửi lại được link xác minh.');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      {/* Heading */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1
          className="font-sans text-2xl font-bold text-stone-900"
          style={{ marginBottom: '0.25rem', letterSpacing: '-0.01em' }}
        >
          Tạo tài khoản
        </h1>
        <p className="text-sm text-stone-500">
          Bắt đầu hành trình khám phá lịch sử Việt Nam
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}
      {success && !pendingVerification && <AuthFormMessage type="success" message={success} />}

      <form
        onSubmit={handleSubmit}
        noValidate
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          opacity: pendingVerification ? 0.55 : 1,
          pointerEvents: pendingVerification ? 'none' : 'auto',
        }}
      >
        <TextInput
          id="reg-email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="email@example.com"
          label="Email"
          icon={Mail}
          autoComplete="email"
          required
        />
        <PasswordInput
          id="reg-password"
          label="Mật khẩu"
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (isStrongPassword(value)) {
              setShowPasswordStrengthError(false);
            }
          }}
          placeholder="Tối thiểu 8 ký tự"
          autoComplete="new-password"
          required
          error={passwordPolicyError}
          hint={passwordPolicyError ? undefined : 'Có chữ hoa, chữ thường, số và ký tự đặc biệt.'}
        />
        <PasswordStrengthMeter password={password} />
        <PasswordInput
          id="reg-confirm-password"
          label="Nhập lại mật khẩu"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            if (value.length > 0) setConfirmTouched(true);
          }}
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
          required
          error={confirmPasswordError}
        />
        <div style={{ marginTop: '0.25rem' }}>
          <SubmitButton loading={loading} disabled={formLocked} />
        </div>
      </form>

      {!pendingVerification && <OAuthButtons mode="register" onError={setError} />}

      <p className="text-center text-sm text-stone-500 mt-5">
        Đã có tài khoản?{' '}
        <Link to="/login" className="font-semibold hover:underline transition-colors" style={{ color: '#8b1e1e', textDecoration: 'none' }}>
          Đăng nhập
        </Link>
      </p>

      {/* Verification dialog — museum style */}
      {pendingVerification && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,25,23,0.72)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 3000,
          }}
        >
          <div
            style={{
              width: 'min(100%, 29rem)',
              background: '#ffffff',
              border: '1px solid #e7e5e4',
              borderRadius: '1rem',
              boxShadow: '0 20px 55px rgba(28,25,23,0.25)',
              padding: '1.5rem',
              maxHeight: 'calc(100vh - 2rem)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <span style={{ color: '#8b1e1e', display: 'flex', marginTop: '0.125rem' }}>
                <CheckCircle size={22} strokeWidth={2} />
              </span>
              <div>
                <h2 id="verify-dialog-title" className="font-sans text-lg font-bold text-stone-900" style={{ margin: 0 }}>
                  Kiểm tra email để xác minh
                </h2>
                <p className="text-sm text-stone-500 mt-2 leading-relaxed">
                  Link xác minh đã được gửi tới <strong style={{ color: '#1c1917' }}>{pendingVerification.email}</strong>.
                </p>
              </div>
            </div>

            <div
              style={{
                border: '1px solid #e7e5e4',
                borderRadius: '0.75rem',
                padding: '0.875rem',
                marginBottom: '1rem',
                textAlign: 'center',
                background: '#fafaf9',
              }}
            >
              <div className="text-xs text-stone-500 font-sans tracking-wider uppercase mb-1">
                Link hết hạn sau
              </div>
              <div
                className="font-sans text-2xl font-bold text-red-900"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {countdownText}
              </div>
            </div>

            {pendingVerification.devVerificationUrl && (
              <a
                href={pendingVerification.devVerificationUrl}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '0.75rem',
                  marginBottom: '0.625rem',
                  background: '#fef2f2',
                  color: '#8b1e1e',
                  border: '1px solid rgba(139,30,30,0.2)',
                  borderRadius: '0.75rem',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                }}
              >
                Mở link xác minh local/dev
              </a>
            )}

            <p className="text-sm text-stone-500 text-center leading-relaxed mb-3">
              Sau khi bấm link trong email, hệ thống sẽ tự đăng nhập và đưa bạn về trang chủ.
            </p>

            <div style={{ display: 'grid', gap: '0.625rem' }}>
              <button
                type="button"
                disabled={resending || resendCooldown > 0}
                onClick={handleResend}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #e7e5e4',
                  background: '#fafaf9',
                  color: '#1c1917',
                  borderRadius: '0.75rem',
                  fontWeight: 600,
                  cursor: resending || resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                <RefreshCw size={16} strokeWidth={2} />
                {resending
                  ? 'Đang gửi lại...'
                  : resendCooldown > 0
                    ? `Gửi lại link sau ${resendCooldown}s`
                    : 'Gửi lại link xác minh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
