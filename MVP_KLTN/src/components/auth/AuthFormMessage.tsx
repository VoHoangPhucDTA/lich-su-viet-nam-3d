interface AuthFormMessageProps {
  type: 'error' | 'success' | 'info';
  message: string;
}

const styles = {
  error: {
    background: 'rgba(159,29,45,0.12)',
    border: '1px solid rgba(159,29,45,0.35)',
    color: '#e8b0b7',
    icon: '⚠️',
  },
  success: {
    background: 'rgba(47,122,87,0.12)',
    border: '1px solid rgba(47,122,87,0.35)',
    color: '#8fc3ad',
    icon: '✅',
  },
  info: {
    background: 'rgba(30,58,95,0.12)',
    border: '1px solid rgba(30,58,95,0.35)',
    color: '#9bb6d1',
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
