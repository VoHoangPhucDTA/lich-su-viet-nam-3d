import { useState, type ComponentType } from 'react';

interface TextInputProps {
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  label: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  autoComplete?: string;
  hint?: string;
  disabled?: boolean;
}

export default function TextInput({
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  label,
  icon: Icon,
  autoComplete,
  hint,
  disabled,
}: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const hasIcon = Boolean(Icon);

  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.375rem' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <span
            style={{
              position: 'absolute',
              left: '0.875rem',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: focused ? 'var(--input-focus)' : 'var(--input-icon)',
              display: 'flex',
              transition: 'color 0.2s',
            }}
          >
            <Icon size={18} strokeWidth={2} />
          </span>
        )}

        <input
          className="themed-input"
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            paddingLeft: hasIcon ? '2.75rem' : '1rem',
            paddingRight: '1rem',
            paddingTop: '0.75rem',
            paddingBottom: '0.75rem',
            background: 'var(--input-bg)',
            border: focused ? '1px solid var(--input-focus)' : '1px solid var(--input-border)',
            borderRadius: '0.625rem',
            color: 'var(--input-text)',
            fontSize: '0.9375rem',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: focused ? '0 0 0 3px var(--accent-soft)' : 'none',
            fontFamily: 'inherit',
            opacity: disabled ? 0.7 : 1,
          }}
        />
      </div>
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>{hint}</p>}
    </div>
  );
}
