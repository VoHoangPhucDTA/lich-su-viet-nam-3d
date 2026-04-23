import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../theme/ThemeContext';

interface AuthLayoutProps {
  children: ReactNode;
}

/* Decorative floating orbs for background ambiance */
function BackgroundOrbs() {
  const { isDark } = useTheme();
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true" style={{ opacity: isDark ? 1 : 0.6 }}>
      {/* Top-left indigo orb */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      {/* Bottom-right gold orb */}
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      {/* Center subtle blue */}
      <div
        style={{
          position: 'absolute',
          top: '40%',
          left: '30%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
      {/* Grid pattern overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(71,85,105,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(71,85,105,0.07) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

/* Small history/map decorative icons */
function DecorativeIcons() {
  const { isDark } = useTheme();
  const icons = [
    { emoji: '🗺️', top: '12%', right: '8%', opacity: isDark ? 0.15 : 0.08, size: '2.5rem', delay: '0s' },
    { emoji: '⚔️', bottom: '20%', left: '5%', opacity: isDark ? 0.12 : 0.06, size: '2rem', delay: '0.5s' },
    { emoji: '🏰', top: '55%', right: '4%', opacity: isDark ? 0.1 : 0.05, size: '1.8rem', delay: '1s' },
    { emoji: '📜', top: '30%', left: '3%', opacity: isDark ? 0.12 : 0.06, size: '1.8rem', delay: '1.5s' },
    { emoji: '🔱', bottom: '10%', right: '12%', opacity: isDark ? 0.1 : 0.05, size: '1.5rem', delay: '0.3s' },
  ];

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {icons.map((icon, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: icon.top,
            bottom: icon.bottom,
            left: icon.left,
            right: icon.right,
            fontSize: icon.size,
            opacity: icon.opacity,
            animation: `float-icon 6s ease-in-out infinite`,
            animationDelay: icon.delay,
          }}
        >
          {icon.emoji}
        </span>
      ))}
    </div>
  );
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const { isDark } = useTheme();
  
  return (
    <div
      style={{
        minHeight: '100vh',
        background: isDark 
          ? 'linear-gradient(135deg, #0f172a 0%, #1a1f35 50%, #0f172a 100%)'
          : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative',
      }}
    >
      <BackgroundOrbs />
      <DecorativeIcons />

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
        {/* Branding header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.625rem',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  width: '2.75rem',
                  height: '2.75rem',
                  borderRadius: '0.75rem',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.375rem',
                  boxShadow: '0 0 20px rgba(99,102,241,0.4)',
                }}
              >
                🗺️
              </div>
              <span
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                Lịch sử Việt Nam 3D
              </span>
            </div>
          </Link>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            Học lịch sử trực quan bằng bản đồ 3D, timeline và AI
          </p>
        </div>

        {/* Form card */}
        <div
          style={{
            background: 'var(--bg-card)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: '1.25rem',
            padding: '2.25rem',
            boxShadow: 'var(--shadow)',
          }}
        >
          {children}
        </div>

        {/* Back to map */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link
            to="/"
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')}
          >
            ← Quay lại Bản đồ
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes float-icon {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-12px) rotate(5deg); }
        }
      `}</style>
    </div>
  );
}
