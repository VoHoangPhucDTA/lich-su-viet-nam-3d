import { useState, useRef } from 'react';
import ProfileLayout from '../../layouts/ProfileLayout';
import { useAuth } from '../../auth/AuthContext';
import UserAvatar from '../../components/profile/UserAvatar';
import { useNavigate } from 'react-router-dom';

/* ─── Shared input ───────────────────────────────────────────────────────────── */
function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '0.75rem 1rem',
          background: disabled ? 'var(--bg-app)' : 'var(--bg-card)',
          border: focused ? '2px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: '0.75rem',
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          fontSize: '0.875rem',
          outline: 'none',
          boxShadow: focused ? 'var(--shadow)' : 'none',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.7 : 1,
        }}
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            outline: 'none',
            fontFamily: 'inherit',
            cursor: 'pointer',
            appearance: 'none',
            transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: '0.6rem' }}>
          ▼
        </div>
      </div>
    </div>
  );
}

/* ─── Card wrapper ───────────────────────────────────────────────────────────── */
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1.25rem',
        padding: '1.75rem',
        marginBottom: '1.5rem',
        boxShadow: 'var(--shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      {children}
    </h2>
  );
}

/* ─── Toast ──────────────────────────────────────────────────────────────────── */
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        padding: '1rem 1.5rem',
        borderRadius: '1rem',
        background: type === 'success' ? 'var(--success)' : 'var(--danger)',
        color: '#fff',
        fontSize: '0.875rem',
        fontWeight: 700,
        zIndex: 9999,
        animation: 'fade-in 0.3s ease-out',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <span style={{ fontSize: '1.2rem' }}>{type === 'success' ? '✅' : '❌'}</span>
      {message}
    </div>
  );
}

/* ─── ProfileSettingsPage ────────────────────────────────────────────────────── */
export default function ProfileSettingsPage() {
  const { currentUser, updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(currentUser?.fullName ?? '');
  const [grade, setGrade] = useState(String(currentUser?.grade ?? ''));
  const [school, setSchool] = useState(currentUser?.school ?? '');
  const [goal, setGoal] = useState('Đạt điểm cao trong kỳ thi THPT Quốc gia');
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatarUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Password fields
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  };

  const handleSaveProfile = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!fullName.trim()) { showToast('Họ tên không được để trống.', 'error'); return; }
    setSaving(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        grade: grade ? Number(grade) : undefined,
        school: school.trim() || undefined,
        avatarUrl: avatarPreview || undefined,
      });
      showToast('Cập nhật hồ sơ thành công!');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Có lỗi xảy ra.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (newPw.length < 6) { showToast('Mật khẩu mới phải có ít nhất 6 ký tự.', 'error'); return; }
    if (newPw !== confirmPw) { showToast('Mật khẩu xác nhận không khớp.', 'error'); return; }
    setPwSaving(true);
    await new Promise(r => setTimeout(r, 600));
    showToast('Đổi mật khẩu thành công! (mock)');
    setOldPw(''); setNewPw(''); setConfirmPw('');
    setPwSaving(false);
  };

  const handleLogoutAll = async () => {
    await new Promise(r => setTimeout(r, 400));
    showToast('Đã đăng xuất khỏi tất cả thiết bị. (mock)');
  };

  const handleDeleteAccount = () => {
    showToast('Chức năng xóa tài khoản chưa được kích hoạt trong phiên bản demo.', 'error');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <ProfileLayout>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          ⚙️ Cài đặt tài khoản
        </h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0, opacity: 0.8 }}>
          Cập nhật thông tin cá nhân và tuỳ chọn bảo mật.
        </p>
      </div>

      {/* ── Profile Info ── */}
      <Card>
        <CardTitle>👤 Thông tin cá nhân</CardTitle>

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ position: 'relative' }}>
            <UserAvatar
              fullName={fullName || 'Học sinh'}
              avatarUrl={avatarPreview}
              size="xl"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                position: 'absolute',
                bottom: '4px',
                right: '4px',
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                background: 'var(--accent)',
                border: '3px solid var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                boxShadow: 'var(--shadow)',
                transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1) rotate(15deg)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1) rotate(0deg)')}
            >
              ✏️
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
          </div>
          <div>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
              {fullName || 'Học sinh'}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {currentUser?.email}
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                marginTop: '0.75rem',
                fontSize: '0.8rem',
                color: 'var(--accent)',
                background: 'var(--accent-soft)',
                padding: '0.375rem 0.875rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--accent)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 700,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Đổi ảnh đại diện
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1.25rem' }}>
            <FormField id="fullName" label="Họ và tên" value={fullName} onChange={setFullName} placeholder="Nguyễn Văn A" />
            <FormField id="email" label="Email" value={currentUser?.email ?? ''} disabled />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1.25rem' }}>
            <SelectField
              id="grade"
              label="Lớp"
              value={grade}
              onChange={setGrade}
              options={[
                { value: '', label: 'Chưa chọn' },
                { value: '10', label: 'Lớp 10' },
                { value: '11', label: 'Lớp 11' },
                { value: '12', label: 'Lớp 12' },
              ]}
            />
            <FormField id="school" label="Trường học" value={school} onChange={setSchool} placeholder="THPT Nguyễn Huệ" />
          </div>

          <FormField
            id="goal"
            label="Mục tiêu học tập"
            value={goal}
            onChange={setGoal}
            placeholder="Đạt điểm cao trong kỳ thi..."
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '0.75rem',
                background: saving ? 'var(--accent-light)' : 'var(--accent)',
                color: '#fff',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: saving ? 'none' : '0 4px 14px rgba(99,102,241,0.3)',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if(!saving) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { if(!saving) e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {saving ? (
                <>
                  <span
                    style={{
                      width: '1rem',
                      height: '1rem',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  Đang lưu...
                </>
              ) : '💾 Lưu hồ sơ'}
            </button>
          </div>
        </form>
      </Card>

      {/* ── Change password ── */}
      <Card>
        <CardTitle>🔒 Đổi mật khẩu</CardTitle>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <FormField id="oldPw" label="Mật khẩu hiện tại" type="password" value={oldPw} onChange={setOldPw} placeholder="••••••••" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1.25rem' }}>
            <FormField id="newPw" label="Mật khẩu mới" type="password" value={newPw} onChange={setNewPw} placeholder="Ít nhất 6 ký tự" />
            <FormField id="confirmPw" label="Xác nhận mật khẩu mới" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Nhập lại mật khẩu mới" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={pwSaving}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '0.75rem',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: pwSaving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if(!pwSaving) e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { if(!pwSaving) e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--accent)'; }}
            >
              {pwSaving ? 'Đang xử lý...' : '🔑 Cập nhật mật khẩu'}
            </button>
          </div>
        </form>
      </Card>

      {/* ── Security ── */}
      <Card>
        <CardTitle>🛡️ Bảo mật & Phiên làm việc</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Logout all */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '1.25rem',
              background: 'var(--bg-app)',
              borderRadius: '1rem',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                Đăng xuất mọi thiết bị
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Kết thúc tất cả phiên đăng nhập khác để bảo vệ tài khoản của bạn.
              </p>
            </div>
            <button
              onClick={handleLogoutAll}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '0.75rem',
                background: 'var(--warning-soft)',
                color: 'var(--warning)',
                border: '1px solid var(--warning)',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              🚪 Đăng xuất tất cả
            </button>
          </div>

          {/* Logout current session */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '1.25rem',
              background: 'var(--bg-app)',
              borderRadius: '1rem',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                Đăng xuất phiên hiện tại
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Rời khỏi ứng dụng trên trình duyệt này.
              </p>
            </div>
            <button
              onClick={handleLogout}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '0.75rem',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              👋 Đăng xuất
            </button>
          </div>
        </div>
      </Card>

      {/* ── Danger zone ── */}
      <Card
        style={{
          border: '1px solid var(--danger)',
          background: 'rgba(239, 68, 68, 0.05)',
        }}
      >
        <CardTitle>⚠️ Vùng nguy hiểm</CardTitle>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ flex: 1, minWidth: '15rem' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--danger)', marginBottom: '0.3rem' }}>
              Xóa tài khoản vĩnh viễn
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Hành động này <strong>không thể hoàn tác</strong>. Toàn bộ dữ liệu, điểm số và lịch sử học tập của bạn sẽ bị xóa vĩnh viễn.
            </p>
          </div>
          <button
            onClick={handleDeleteAccount}
            style={{
              padding: '0.65rem 1.5rem',
              borderRadius: '0.75rem',
              background: 'var(--danger)',
              color: '#fff',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            🗑️ Xóa tài khoản
          </button>
        </div>
      </Card>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </ProfileLayout>
  );
}
