import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

interface OAuthButtonsProps {
  onError?: (msg: string) => void;
}

function OAuthButton({
  onClick,
  logo,
  label,
  loading,
}: {
  onClick: () => void;
  logo: string;
  label: string;
  loading: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.625rem',
        padding: '0.75rem 1rem',
        background: hovered && !loading
          ? 'var(--bg-surface)'
          : 'var(--input-bg)',
        border: '1px solid var(--input-border)',
        borderRadius: '0.625rem',
        color: 'var(--input-text)',
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'all 0.2s',
        borderColor: hovered && !loading ? 'var(--accent)' : 'var(--input-border)',
        boxShadow: hovered && !loading
          ? '0 8px 18px -8px rgba(15, 23, 42, 0.45)'
          : '0 1px 2px rgba(15, 23, 42, 0.12)',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? (
        <span
          style={{
            width: '1rem',
            height: '1rem',
            border: '2px solid var(--accent)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      ) : (
        <span style={{ fontSize: '1.25rem' }}>{logo}</span>
      )}
      <span>{label}</span>
    </button>
  );
}

export default function OAuthButtons({ onError }: OAuthButtonsProps) {
  const { loginWithGoogle, loginWithFacebook } = useAuth();
  const navigate = useNavigate();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingFacebook, setLoadingFacebook] = useState(false);

  const handleGoogle = async () => {
    setLoadingGoogle(true);
    try {
      await loginWithGoogle();
      navigate('/profile/dashboard', { replace: true });
    } catch {
      onError?.('Đăng nhập Google thất bại. Thử lại sau.');
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleFacebook = async () => {
    setLoadingFacebook(true);
    try {
      await loginWithFacebook();
      navigate('/profile/dashboard', { replace: true });
    } catch {
      onError?.('Đăng nhập Facebook thất bại. Thử lại sau.');
    } finally {
      setLoadingFacebook(false);
    }
  };

  return (
    <div>
      {/* Divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          margin: '1.5rem 0',
        }}
      >
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>hoặc</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>

      {/* Buttons row */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <OAuthButton
          onClick={handleGoogle}
          logo="🔵"
          label="Google"
          loading={loadingGoogle}
        />
        <OAuthButton
          onClick={handleFacebook}
          logo="🔷"
          label="Facebook"
          loading={loadingFacebook}
        />
      </div>

      {/* Disclaimer */}
      <p
        style={{
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          marginTop: '1rem',
          lineHeight: 1.5,
          opacity: 0.8,
        }}
      >
        * OAuth là mô phỏng — chỉ dùng cho demo
      </p>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
