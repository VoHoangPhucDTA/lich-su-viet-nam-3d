import { CheckCircle2, CircleAlert, Info } from 'lucide-react';

interface AuthFormMessageProps {
  type: 'error' | 'success' | 'info';
  message: string;
}

const styles = {
  error: {
    background: 'rgba(159,29,45,0.12)',
    border: '1px solid rgba(159,29,45,0.35)',
    color: '#e8b0b7',
    Icon: CircleAlert,
  },
  success: {
    background: 'rgba(47,122,87,0.12)',
    border: '1px solid rgba(47,122,87,0.35)',
    color: '#8fc3ad',
    Icon: CheckCircle2,
  },
  info: {
    background: 'rgba(30,58,95,0.12)',
    border: '1px solid rgba(30,58,95,0.35)',
    color: '#9bb6d1',
    Icon: Info,
  },
};

export default function AuthFormMessage({ type, message }: AuthFormMessageProps) {
  if (!message) return null;

  const s = styles[type];
  const Icon = s.Icon;

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
      <span style={{ flexShrink: 0, marginTop: '0.0625rem', display: 'flex' }}>
        <Icon size={18} strokeWidth={2} />
      </span>
      <span>{message}</span>
    </div>
  );
}
