import { useState } from 'react';

interface TextInputProps {
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  label: string;
  icon: string;
  autoComplete?: string;
  hint?: string;
}

export default function TextInput({
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  label,
  icon,
  autoComplete,
  hint,
}: TextInputProps) {
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
        {/* Icon span */}
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
          {icon}
        </span>

        <input
          className="themed-input"
          id={id}
          type={type}
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
            paddingRight: '1rem',
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
      </div>
      {hint && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
