export function passwordStrength(password: string) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { label: 'Rất yếu', color: '#dc2626', width: '20%', hint: 'Thêm chữ hoa, số hoặc ký tự đặc biệt.' };
  if (score === 3) return { label: 'Yếu', color: '#f59e0b', width: '40%', hint: 'Nên dùng ít nhất 8 ký tự và nhiều loại ký tự hơn.' };
  if (score === 4) return { label: 'Trung bình', color: '#f59e0b', width: '60%', hint: 'Mật khẩu tạm ổn, thêm ký tự đặc biệt sẽ tốt hơn.' };
  if (score === 5) return { label: 'Mạnh', color: '#16a34a', width: '80%', hint: 'Mật khẩu đã đủ tốt.' };
  return { label: 'Rất mạnh', color: '#15803d', width: '100%', hint: 'Mật khẩu rất tốt.' };
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  if (!strength) return null;

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ height: '0.25rem', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: strength.width,
            background: strength.color,
            borderRadius: '999px',
            transition: 'width 0.25s ease, background 0.25s ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.375rem', fontSize: '0.75rem', lineHeight: 1.45 }}>
        <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
        <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{strength.hint}</span>
      </div>
    </div>
  );
}
