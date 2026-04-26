import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthFormMessage from '../../components/auth/AuthFormMessage';
import PasswordInput from '../../components/auth/PasswordInput';
import TextInput from '../../components/auth/TextInput';

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
        boxShadow: loading ? 'none' : '0 4px 15px rgba(30,58,95,0.2)',
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
      {loading ? 'Đang tạo...' : label}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

/* ─── RegisterPage ──────────────────────────────────────────────────────── */
export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [grade, setGrade] = useState<number>(11);
  const [school, setSchool] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = (): string => {
    if (!fullName.trim()) return 'Vui lòng nhập họ và tên.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return 'Email không hợp lệ.';
    if (password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (password !== confirmPassword) return 'Mật khẩu nhập lại không khớp.';
    if (!agreed) return 'Bạn cần đồng ý với điều khoản sử dụng.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError('');
    setLoading(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        grade,
        school: school.trim() || undefined,
      });
      setSuccess('Đăng ký thành công! Đang chuyển hướng...');
      setTimeout(() => navigate('/profile/dashboard', { replace: true }), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại.');
    } finally {
      setLoading(false);
    }
  };

  const [gradeFocused, setGradeFocused] = useState(false);

  return (
    <AuthLayout>
      {/* Title */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '0.375rem',
            letterSpacing: '-0.01em',
          }}
        >
          Tạo tài khoản
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Bắt đầu hành trình khám phá lịch sử Việt Nam
        </p>
      </div>

      {error && <AuthFormMessage type="error" message={error} />}
      {success && <AuthFormMessage type="success" message={success} />}

      <form
        onSubmit={handleSubmit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
      >
        <TextInput
          id="reg-name"
          value={fullName}
          onChange={setFullName}
          placeholder="Nguyễn Văn An"
          required
          label="Họ và tên"
          icon="👤"
          autoComplete="name"
        />

        <TextInput
          id="reg-email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="email@example.com"
          required
          label="Email"
          icon="📧"
          autoComplete="email"
        />

        <PasswordInput
          id="reg-password"
          value={password}
          onChange={setPassword}
          placeholder="Tối thiểu 6 ký tự"
          required
          autoComplete="new-password"
          label="Mật khẩu"
          hint="Ít nhất 6 ký tự"
        />

        <PasswordInput
          id="reg-confirm"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Nhập lại mật khẩu"
          required
          autoComplete="new-password"
          label="Nhập lại mật khẩu"
        />

        {/* Grade select */}
        <div>
          <label
            htmlFor="reg-grade"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '0.375rem',
            }}
          >
            Lớp hiện tại
          </label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '0.875rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1rem',
                pointerEvents: 'none',
                color: gradeFocused ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'color 0.2s',
              }}
            >
              🎓
            </span>
            <select
              id="reg-grade"
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value))}
              onFocus={() => setGradeFocused(true)}
              onBlur={() => setGradeFocused(false)}
              style={{
                width: '100%',
                paddingLeft: '2.75rem',
                paddingRight: '1rem',
                paddingTop: '0.75rem',
                paddingBottom: '0.75rem',
                background: 'var(--input-bg)',
                border: gradeFocused
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
                borderRadius: '0.625rem',
                color: 'var(--text-primary)',
                fontSize: '0.9375rem',
                outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: gradeFocused ? '0 0 0 3px var(--accent-soft)' : 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              <option value={10}>Lớp 10</option>
              <option value={11}>Lớp 11</option>
              <option value={12}>Lớp 12</option>
            </select>
          </div>
        </div>

        <TextInput
          id="reg-school"
          value={school}
          onChange={setSchool}
          placeholder="THPT Nguyễn Huệ (tuỳ chọn)"
          label="Trường học"
          icon="🏫"
          autoComplete="organization"
        />

        {/* Terms checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.625rem',
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            id="terms-agreed"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{
              accentColor: 'var(--accent)',
              cursor: 'pointer',
              width: '1rem',
              height: '1rem',
              marginTop: '0.125rem',
              flexShrink: 0,
            }}
          />
          <span>
            Tôi đồng ý với{' '}
            <span
              style={{ color: 'var(--accent)', fontWeight: 600 }}
            >
              Điều khoản sử dụng
            </span>{' '}
            và{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              Chính sách bảo mật
            </span>
          </span>
        </label>

        <div style={{ marginTop: '0.25rem' }}>
          <SubmitButton loading={loading} label="Tạo tài khoản" />
        </div>
      </form>

      <p
        style={{
          textAlign: 'center',
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          marginTop: '1.25rem',
        }}
      >
        Đã có tài khoản?{' '}
        <Link
          to="/login"
          style={{
            color: 'var(--accent)',
            textDecoration: 'none',
            fontWeight: 600,
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)')}
        >
          Đăng nhập
        </Link>
      </p>
    </AuthLayout>
  );
}
