interface AuthFormMessageProps {
  type: 'error' | 'success' | 'info';
  message: string;
}

const styles = {
  error: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.35)',
    color: '#fca5a5',
    icon: '⚠️',
  },
  success: {
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.35)',
    color: '#6ee7b7',
    icon: '✅',
  },
  info: {
    background: 'rgba(59,130,246,0.1)',
    border: '1px solid rgba(59,130,246,0.35)',
    color: '#93c5fd',
    icon: 'ℹ️',
  },
};

export default function AuthFormMessage({ type, message }: AuthFormMessageProps) {
  if (!message) return null;

  const s = styles[type];

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.625rem',
        padding: '0.875rem 1rem',
        borderRadius: '0.625rem',
        background: s.background,
        border: s.border,
        color: s.color,
        fontSize: '0.875rem',
        lineHeight: 1.5,
        marginBottom: '1.25rem',
      }}
    >
      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '0.0625rem' }}>{s.icon}</span>
      <span>{message}</span>
    </div>
  );
}
