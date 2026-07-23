import type { ComponentType } from 'react';

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

/**
 * Renders a labeled text input with optional icon and hint text.
 *
 * @param id - The input's unique identifier.
 * @param value - The current input value.
 * @param onChange - Called with the updated input value.
 * @param label - The label displayed for the input.
 * @param hint - Optional supporting text associated with the input.
 */
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
  const hasIcon = Boolean(Icon);
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-field-label">
        {label}
      </label>
      <div className="auth-input-wrap">
        {Icon && (
          <span className="auth-input-icon" aria-hidden="true">
            <Icon size={17} strokeWidth={1.8} />
          </span>
        )}

        <input
          className={`auth-input ${hasIcon ? 'auth-input-with-icon' : ''}`}
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-describedby={hintId}
        />
      </div>
      {hint && <p id={hintId} className="auth-field-hint">{hint}</p>}
    </div>
  );
}
