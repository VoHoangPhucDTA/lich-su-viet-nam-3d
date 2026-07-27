import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  label: string;
  hint?: string;
  /** Hiển thị lỗi đỏ bên dưới input (ghi đè hint nếu có) */
  error?: string;
  /** Callback khi input được focus */
  onFocus?: () => void;
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
  error,
  onFocus,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-field-label">
        {label}
      </label>
      <div className="auth-input-wrap">
        <span className="auth-input-icon" aria-hidden="true">
          <Lock size={17} strokeWidth={1.8} />
        </span>

        <input
          className="auth-input auth-input-with-icon auth-password-input"
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          onFocus={onFocus}
          aria-describedby={descriptionId}
          aria-invalid={Boolean(error)}
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          className="auth-password-toggle"
        >
          {visible ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="auth-field-error" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="auth-field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
