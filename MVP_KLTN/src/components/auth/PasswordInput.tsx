import { useState } from 'react';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  label: string;
  hint?: string;
}

export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder = '••••••',
  required = false,
  autoComplete = 'current-password',
  label,
  hint,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: '0.375rem',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {/* Lock icon */}
        <span
          style={{
            position: 'absolute',
            left: '0.875rem',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '1rem',
            pointerEvents: 'none',
            color: focused ? 'var(--input-focus)' : 'var(--input-icon)',
            transition: 'color 0.2s',
          }}
        >
          🔒
        </span>

        <input
          className="themed-input"
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            paddingLeft: '2.75rem',
            paddingRight: '3rem',
            paddingTop: '0.75rem',
            paddingBottom: '0.75rem',
            background: 'var(--input-bg)',
            border: focused
              ? '1px solid var(--input-focus)'
              : '1px solid var(--input-border)',
            borderRadius: '0.625rem',
            color: 'var(--input-text)',
            fontSize: '0.9375rem',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: focused ? '0 0 0 3px var(--accent-soft)' : 'none',
            fontFamily: 'inherit',
          }}
        />

        {/* Toggle visibility button */}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          style={{
            position: 'absolute',
            right: '0.875rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.1rem',
            color: 'var(--input-icon)',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--input-text)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--input-icon)')}
        >
          {visible ? '🙈' : '👁️'}
        </button>
      </div>
      {hint && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>{hint}</p>
      )}
    </div>
  );
}
