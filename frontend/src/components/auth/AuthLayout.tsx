import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
}

/* Warm stone-amber background orbs — subtle museum ambiance */
function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true" style={{ opacity: 0.55 }}>
      {/* Top-left red-900 glow */}
      <div
        style={{
          position: 'absolute',
          top: '-8%',
          left: '-8%',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,30,30,0.14) 0%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />
      {/* Bottom-right gold glow */}
      <div
        style={{
          position: 'absolute',
          bottom: '-12%',
          right: '-8%',
          width: '480px',
          height: '480px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(197,160,89,0.12) 0%, transparent 70%)',
          filter: 'blur(56px)',
        }}
      />
      {/* Center-subtle stone warmth */}
      <div
        style={{
          position: 'absolute',
          top: '35%',
          left: '25%',
          width: '360px',
          height: '360px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(120,113,108,0.06) 0%, transparent 70%)',
          filter: 'blur(44px)',
        }}
      />
    </div>
  );
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #fafaf9 0%, #f5f5f4 45%, #fafaf9 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative',
      }}
    >
      <BackgroundOrbs />

      {/* Main card */}
      <div
        className="animate-fade-in"
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '460px',
        }}
      >
        {/* Branding header — museum style */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/home" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.625rem',
                marginBottom: '0.625rem',
              }}
            >
              {/* Compass motif — matching lsvn3d Navbar */}
              <div
                style={{
                  position: 'relative',
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '0.875rem',
                  background: 'linear-gradient(135deg, #8b1e1e, #581c1c)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f5d68a',
                  boxShadow: '0 4px 16px rgba(139,30,30,0.25)',
                  border: '1px solid rgba(197,160,89,0.3)',
                }}
              >
                <div
                  className="absolute inset-0 rounded-full border border-amber-400/20 animate-spin-slow"
                  style={{ margin: '2px' }}
                />
                <Compass className="h-5 w-5 relative z-10" strokeWidth={1.5} />
              </div>
              <span
                className="font-serif text-xl font-bold text-stone-900 tracking-tight"
                style={{ letterSpacing: '-0.01em' }}
              >
                Lịch Sử Việt Nam
              </span>
            </div>
          </Link>
          <p
            className="font-mono text-[10px] tracking-[0.15em] uppercase font-semibold"
            style={{ color: '#78716c' }}
          >
            Bảo tàng số học đường THPT
          </p>
        </div>

        {/* Form card */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: '1.25rem',
            padding: '2.25rem',
            boxShadow: '0 8px 32px -12px rgba(0,0,0,0.08)',
          }}
        >
          {children}
        </div>

        {/* Back link */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link
            to="/home"
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors duration-200"
            style={{
              color: '#78716c',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#8b1e1e')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#78716c')}
          >
            ← Quay lại trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
