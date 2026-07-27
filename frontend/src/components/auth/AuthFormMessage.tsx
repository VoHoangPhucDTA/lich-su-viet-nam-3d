import { CheckCircle2, CircleAlert, Info } from 'lucide-react';

interface AuthFormMessageProps {
  type: 'error' | 'success' | 'info';
  message: string;
}

const variants = {
  error: {
    Icon: CircleAlert,
    className: 'auth-msg-error',
  },
  success: {
    Icon: CheckCircle2,
    className: 'auth-msg-success',
  },
  info: {
    Icon: Info,
    className: 'auth-msg-info',
  },
};

export default function AuthFormMessage({ type, message }: AuthFormMessageProps) {
  if (!message) return null;

  const v = variants[type];
  const Icon = v.Icon;

  return (
    <div
      className={`auth-form-message animate-fade-in ${v.className}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderRadius: '0.75rem',
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
