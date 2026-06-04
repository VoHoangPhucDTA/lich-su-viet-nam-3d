import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

// ── Google GSI types ──────────────────────────────────────────────────────────

interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      type?: 'standard' | 'icon';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      width?: number;
      locale?: string;
    }
  ) => void;
  cancel: () => void;
}

// ── Facebook SDK types ────────────────────────────────────────────────────────

interface FacebookAuthResponse {
  accessToken: string;
  userID: string;
  expiresIn: number;
  signedRequest: string;
  graphDomain: string;
  data_access_expiration_time: number;
}

interface FacebookLoginStatus {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse: FacebookAuthResponse | null;
}

interface FacebookSdk {
  init: (params: {
    appId: string;
    version: string;
    cookie?: boolean;
    xfbml?: boolean;
  }) => void;
  login: (
    callback: (response: FacebookLoginStatus) => void,
    options?: { scope: string }
  ) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined;

// ── Icons ─────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.027 4.388 11.027 10.125 11.927V15.563H7.078V12.073h3.047V9.413c0-3.007 1.79-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796v8.437C19.612 23.1 24 18.1 24 12.073z"
      />
    </svg>
  );
}

// ── Shared OAuthButton ────────────────────────────────────────────────────────

function OAuthButton({
  label,
  icon,
  onClick,
  disabled,
  loading,
  disabledReason,
  iconOnly,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  disabledReason?: string;
  iconOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const isInteractive = !disabled && !loading;

  return (
    <div style={{ flex: iconOnly ? 'none' : 1, position: 'relative' }}>
      <button
        type="button"
        onClick={isInteractive ? onClick : undefined}
        disabled={disabled || loading}
        aria-label={label}
        aria-disabled={disabled || loading}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: iconOnly ? '40px' : '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: iconOnly ? '0' : '12px',
          padding: iconOnly ? '0' : '0 12px',
          height: '40px',
          background: hovered && isInteractive ? '#f8f9fa' : '#ffffff',
          border: '1px solid #dadce0',
          borderRadius: iconOnly ? '50%' : '4px',
          color: '#3c4043',
          fontSize: '14px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : loading ? 'wait' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'background-color 0.2s',
          fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px' }}>
          {icon}
        </div>
        {!iconOnly && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {loading ? '...' : label}
          </span>
        )}
      </button>

      {disabled && disabledReason && hovered && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            padding: '0.375rem 0.75rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
          }}
        >
          {disabledReason}
        </div>
      )}
    </div>
  );
}

// ── OAuthButtons ──────────────────────────────────────────────────────────────

interface OAuthButtonsProps {
  mode?: 'login' | 'register';
  onError?: (msg: string) => void;
}

export default function OAuthButtons({ mode = 'login', onError }: OAuthButtonsProps) {
  const { loginWithGoogle, loginWithFacebook } = useAuth();
  const navigate = useNavigate();

  // ── Google state ────────────────────────────────────────────────────
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const gsiInitialized = useRef(false);
  const gsiRendered = useRef(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);

  // ── Facebook state ──────────────────────────────────────────────────
  const [fbSdkReady, setFbSdkReady] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);

  const actionLabel = 'Đăng nhập bằng';
  const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);
  const isFacebookConfigured = Boolean(FACEBOOK_APP_ID);

  // ── Redirect helper ──────────────────────────────────────────────────
  // Nhận role tự kết quả login thay vì đọc từ localStorage (loadFromStorage đã bị xóa)
  const redirectAfterLogin = useCallback((role: string = 'student') => {
    // Bước 6B.2.13: OAuthButtons.tsx: Chuyển hướng trang chủ
    // Bước 6B.3.13: OAuthButtons.tsx: Chuyển hướng trang chủ
    navigate(role === 'admin' ? '/admin/dashboard' : '/', { replace: true });
  }, [navigate]);

  // ── Google GSI ───────────────────────────────────────────────────────
  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      // Bước 6B.2.2: Google Server: Trả về credential (id_token)
      if (!response.credential) {
        onError?.('Không nhận được thông tin từ Google. Vui lòng thử lại.');
        return;
      }
      try {
        // Bước 6B.2.3: OAuthButtons.tsx: gọi loginWithGoogle trong authService.ts
        const res = await loginWithGoogle(response.credential);
        // Bước 6B.2.13: Chuyển hướng theo role trả về từ backend
        redirectAfterLogin(res.user?.role);
      } catch (err: unknown) {
        onError?.(err instanceof Error ? err.message : 'Đăng nhập Google thất bại. Vui lòng thử lại.');
      }
    },
    [loginWithGoogle, redirectAfterLogin, onError]
  );

  useEffect(() => {
    if (!isGoogleConfigured) return;

    const initAndRender = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;

      if (!gsiInitialized.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID!,
          callback: handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        gsiInitialized.current = true;
      }

      if (!gsiRendered.current) {
        googleButtonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          type: 'icon',
          shape: 'circle',
          locale: 'vi',
        });
        gsiRendered.current = true;
      }

      setGoogleScriptReady(true);
    };

    if (window.google?.accounts?.id) {
      initAndRender();
      return;
    }

    const existingScript = document.getElementById('google-gsi-script') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', initAndRender, { once: true });
      return () => existingScript.removeEventListener('load', initAndRender);
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initAndRender;
    script.onerror = () =>
      onError?.('Không tải được Google SDK. Vui lòng kiểm tra mạng hoặc cấu hình Google OAuth.');
    document.head.appendChild(script);
  }, [isGoogleConfigured, handleGoogleCredential, mode, onError]);

  // ── Facebook SDK loader ──────────────────────────────────────────────
  useEffect(() => {
    if (!isFacebookConfigured) return;

    // SDK already loaded (e.g. React hot reload)
    if (window.FB) {
      setFbSdkReady(true);
      return;
    }

    // fbAsyncInit is called by the Facebook SDK after it finishes loading
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId: FACEBOOK_APP_ID!,
        version: 'v21.0',
        cookie: true,
        xfbml: false,
      });
      setFbSdkReady(true);
    };

    if (!document.getElementById('facebook-sdk-script')) {
      const script = document.createElement('script');
      script.id = 'facebook-sdk-script';
      script.src = 'https://connect.facebook.net/vi_VN/sdk.js';
      script.async = true;
      script.defer = true;
      script.onerror = () =>
        onError?.('Không tải được Facebook SDK. Vui lòng kiểm tra kết nối mạng.');
      document.head.appendChild(script);
    }

    return () => {
      delete window.fbAsyncInit;
    };
  }, [isFacebookConfigured, onError]);

  // ── Facebook Login handler ───────────────────────────────────────────
  const handleFacebookLogin = useCallback(() => {
    if (!window.FB) {
      onError?.('Facebook SDK chưa sẵn sàng. Vui lòng thử lại sau.');
      return;
    }

    setFbLoading(true);

    try {
      window.FB.login(
        (response: FacebookLoginStatus) => {
          // Bước 6B.3.2: Facebook Server: Trả về access_token
          if (response.status !== 'connected' || !response.authResponse?.accessToken) {
            setFbLoading(false);
            return;
          }
          // FB.login KHÔNG chấp nhận async callback => dùng IIFE bên trong
          (async () => {
            try {
              // Bước 6B.3.3: OAuthButtons.tsx: gọi loginWithFacebook trong authService.ts
              const res = await loginWithFacebook(response.authResponse!.accessToken);
              // Bước 6B.3.13: Chuyển hướng theo role trả về từ backend
              redirectAfterLogin(res.user?.role);
            } catch (err: unknown) {
              const rawMsg = err instanceof Error ? err.message : '';
              let msg = 'Đăng nhập Facebook thất bại. Vui lòng thử lại.';
              if (rawMsg.includes('SOCIAL_EMAIL_REQUIRED'))
                msg = 'Tài khoản Facebook của bạn không cung cấp email. Vui lòng dùng email/mật khẩu.';
              else if (rawMsg.includes('INVALID_SOCIAL_TOKEN'))
                msg = 'Token Facebook không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.';
              else if (rawMsg.includes('ACCOUNT_DISABLED'))
                msg = 'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ hỗ trợ.';
              else if (rawMsg.includes('OAUTH_NOT_CONFIGURED'))
                msg = 'Đăng nhập Facebook chưa được cấu hình trên server.';
              onError?.(msg);
            } finally {
              setFbLoading(false);
            }
          })();
        },
        { scope: 'public_profile,email' }
      );
    } catch (err) {
      setFbLoading(false);
      console.error("[Facebook Login Error]:", err);
      onError?.('Lỗi gọi Facebook Login. Đảm bảo bạn không dùng Tab Ẩn danh (chặn Cookie) và đang truy cập HTTPS.');
    }
  }, [loginWithFacebook, redirectAfterLogin, onError]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div>
      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.25rem 0' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>
          hoặc
        </span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>

      {/* Social buttons row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
        {/* Google */}
        {isGoogleConfigured ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '40px',
              width: '40px',
              opacity: googleScriptReady ? 1 : 0.72,
            }}
          >
            <div ref={googleButtonRef} style={{ display: 'flex', justifyContent: 'center' }} />
          </div>
        ) : (
          <OAuthButton
            label={`${actionLabel} Google`}
            icon={<GoogleIcon />}
            onClick={() => onError?.('Google OAuth chưa được cấu hình. Liên hệ quản trị viên.')}
            disabled
            disabledReason="Google OAuth chưa được cấu hình"
            iconOnly
          />
        )}

        {/* Facebook */}
        {isFacebookConfigured ? (
          <OAuthButton
            label={`${actionLabel} Facebook`}
            icon={<FacebookIcon />}
            onClick={handleFacebookLogin}
            disabled={!fbSdkReady}
            loading={fbLoading}
            disabledReason={!fbSdkReady ? 'Đang tải Facebook SDK...' : undefined}
            iconOnly
          />
        ) : (
          <OAuthButton
            label="Facebook"
            icon={<FacebookIcon />}
            onClick={() => onError?.('Facebook OAuth chưa được cấu hình. Liên hệ quản trị viên.')}
            disabled
            disabledReason="Facebook OAuth chưa được cấu hình"
            iconOnly
          />
        )}
      </div>

    </div>
  );
}
