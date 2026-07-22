import { useState, useRef } from 'react';
import ProfileLayout from '../../layouts/ProfileLayout';
import { useAuth } from '../../auth/AuthContext';
import UserAvatar from '../../components/profile/UserAvatar';
import DeleteAccountDialog from '../../components/profile/DeleteAccountDialog';
import { useNavigate } from 'react-router-dom';
import { uploadAvatarImage } from '../../services/cloudinaryService';
import { isStrongPassword, passwordStrengthMessage } from '../../utils/passwordUtils';
import PasswordInput from '../../components/auth/PasswordInput';
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter';
import {
  User,
  Lock,
  Shield,
  AlertTriangle,
  Save,
  Camera,
  CheckCircle,
  XCircle,
  LogIn,
  Upload,
} from 'lucide-react';

/* ─── Shared input ──────────────────────────────────────────────────────────── */
function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  helperText,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-sans font-bold uppercase tracking-wider text-stone-400 mb-1.5">
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
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
        style={{
          background: disabled ? '#f5f5f4' : '#fff',
          border: focused ? '2px solid #8b1e1e' : '1px solid #e7e5e4',
          color: disabled ? '#a8a29e' : '#1c1917',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      {helperText && (
        <p className="text-xs text-stone-400 mt-1">{helperText}</p>
      )}
    </div>
  );
}

/* ─── Select field ──────────────────────────────────────────────────────────── */
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
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-sans font-bold uppercase tracking-wider text-stone-400 mb-1.5">
        {label}
      </label>
      <div className="relative" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <select
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none appearance-none cursor-pointer transition-all duration-200"
          style={{
            background: '#fff',
            border: focused ? '2px solid #8b1e1e' : '1px solid #e7e5e4',
            color: '#1c1917',
            fontFamily: 'inherit',
          }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400 text-xs">
          ▼
        </div>
      </div>
    </div>
  );
}

/* ─── Card wrapper ──────────────────────────────────────────────────────────── */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white border border-stone-200/60 p-6 sm:p-7 ${className}`}>
      {children}
    </div>
  );
}

/* ─── Card title ────────────────────────────────────────────────────────────── */
function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-sans text-xl font-bold text-stone-900 mb-6 flex items-center gap-3">
      {children}
    </h2>
  );
}

/* ─── Toast ─────────────────────────────────────────────────────────────────── */
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold shadow-lg animate-fade-in"
      style={{
        background: type === 'success' ? '#3D8361' : '#8b1e1e',
        color: '#fff',
      }}>
      {type === 'success' ? (
        <CheckCircle size={18} strokeWidth={2} />
      ) : (
        <XCircle size={18} strokeWidth={2} />
      )}
      {message}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function ProfileSettingsPage() {
  const { currentUser, updateProfile, changePassword, deleteAccount, logout } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(currentUser?.fullName ?? '');
  const [grade, setGrade] = useState(String(currentUser?.grade ?? ''));
  const [school, setSchool] = useState(currentUser?.school ?? '');
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatarUrl ?? '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Password fields
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  /* ── Avatar: Cloudinary upload ──────────────────────────────────────────── */
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side image validation
    if (!file.type.startsWith('image/')) {
      showToast('Chỉ chấp nhận file ảnh.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Ảnh không được lớn hơn 5MB.', 'error');
      return;
    }

    setAvatarUploading(true);
    const cloudinaryUrl = await uploadAvatarImage(file);
    setAvatarUploading(false);

    if (cloudinaryUrl) {
      setAvatarPreview(cloudinaryUrl);
      // Auto-save avatar immediately — step 5-8 in expected flow
      try {
        await updateProfile({ avatarUrl: cloudinaryUrl });
        showToast('Cập nhật ảnh đại diện thành công!');
      } catch {
        showToast('Tải ảnh lên Cloudinary thành công, nhưng lưu hồ sơ thất bại. Hãy thử lưu lại.', 'error');
      }
    } else {
      // Fallback: show local preview anyway so user sees their selection
      setAvatarPreview(URL.createObjectURL(file));
      showToast('Không thể tải lên Cloudinary. Ảnh sẽ chỉ hiển thị tạm thời.', 'error');
    }

    // Reset file input so re-selecting the same file triggers change again
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── Save profile ───────────────────────────────────────────────────────── */
  const handleSaveProfile = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!fullName.trim()) { showToast('Họ tên không được để trống.', 'error'); return; }
    setSaving(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        grade: grade ? (grade as '10' | '11' | '12' | 'other') : undefined,
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

  /* ── Change password ────────────────────────────────────────────────────── */
  const handleChangePassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setPwError('');

    if (!oldPw) {
      setPwError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (!isStrongPassword(newPw)) {
      setPwError(passwordStrengthMessage(newPw));
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Mật khẩu nhập lại không khớp.');
      return;
    }

    setPwSaving(true);
    try {
      await changePassword({ oldPassword: oldPw, newPassword: newPw });
      showToast('Đổi mật khẩu thành công!');
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : 'Có lỗi xảy ra khi đổi mật khẩu.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleOpenDeleteDialog = () => {
    setShowDeleteDialog(true);
  };

  const handleCancelDelete = () => {
    if (!deleting) setShowDeleteDialog(false);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      showToast('Tài khoản đã được xóa vĩnh viễn.');
      setShowDeleteDialog(false);
      setTimeout(() => navigate('/login'), 1500);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Có lỗi xảy ra khi xóa tài khoản.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <ProfileLayout>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div className="space-y-8 lg:space-y-10 animate-fade-in">
        {/* Page Header */}
        <div className="space-y-2">
          <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-red-900">Cài đặt</span>
          <h1 className="font-sans text-2xl sm:text-3xl font-black text-stone-900 leading-tight tracking-tight">
            Cài đặt tài khoản
          </h1>
          <p className="text-sm text-stone-500">
            Cập nhật thông tin cá nhân và tuỳ chọn bảo mật.
          </p>
          <div className="h-px w-10 bg-amber-400 rounded-full" />
        </div>

        {/* ── Profile Info ── */}
        <Card>
          <CardTitle>
            <User size={18} strokeWidth={1.5} className="text-red-900" />
            Thông tin cá nhân
          </CardTitle>

          {/* Avatar */}
          <div className="flex items-center gap-5 mb-7 pb-7 border-b border-stone-100">
            <div className="relative">
              <UserAvatar fullName={fullName || 'Học sinh'} avatarUrl={avatarPreview} size="xl" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border-2 border-stone-200 flex items-center justify-center shadow-sm cursor-pointer transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {avatarUploading ? (
                  <span className="w-3.5 h-3.5 border-2 border-stone-400 border-t-red-900 rounded-full animate-spin" />
                ) : (
                  <Camera size={14} strokeWidth={1.8} className="text-stone-500" />
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </div>
            <div>
              <p className="font-sans text-lg font-bold text-stone-900">{fullName || 'Học sinh'}</p>
              <p className="text-sm text-stone-400">{currentUser?.email}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="mt-2 text-xs font-sans font-bold uppercase tracking-wider text-red-900 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200/60 hover:bg-red-100 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {avatarUploading ? (
                  <><span className="w-3 h-3 border-2 border-red-900/30 border-t-red-900 rounded-full animate-spin" /> Đang tải</>
                ) : (
                  <><Upload size={12} strokeWidth={2} /> Đổi ảnh</>
                )}
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField id="fullName" label="Họ và tên" value={fullName} onChange={setFullName} placeholder="Nguyễn Văn A" />
              <FormField id="email" label="Email" value={currentUser?.email ?? ''} disabled helperText="Email không thể thay đổi" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-sans font-bold uppercase tracking-wider transition-all duration-200 bg-red-900 text-amber-50 hover:bg-red-950 disabled:opacity-50"
                style={{ fontFamily: 'inherit' }}
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang lưu
                  </>
                ) : (
                  <>
                    <Save size={15} strokeWidth={2} />
                    Lưu hồ sơ
                  </>
                )}
              </button>
            </div>
          </form>
        </Card>

        {/* ── Change Password ── */}
        <Card>
          <CardTitle>
            <Lock size={18} strokeWidth={1.5} className="text-red-900" />
            Đổi mật khẩu
          </CardTitle>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-5">
            <PasswordInput
              id="oldPw"
              label="Mật khẩu hiện tại"
              value={oldPw}
              onChange={setOldPw}
              placeholder="••••••••"
              autoComplete="current-password"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <PasswordInput
                  id="newPw"
                  label="Mật khẩu mới"
                  value={newPw}
                  onChange={setNewPw}
                  placeholder="Tối thiểu 8 ký tự"
                  autoComplete="new-password"
                  hint="Có chữ hoa, chữ thường, số và ký tự đặc biệt"
                />
                <PasswordStrengthMeter password={newPw} />
              </div>
              <PasswordInput
                id="confirmPw"
                label="Xác nhận mật khẩu mới"
                value={confirmPw}
                onChange={setConfirmPw}
                placeholder="Nhập lại mật khẩu"
                autoComplete="new-password"
                error={confirmPw.length > 0 && newPw !== confirmPw ? 'Mật khẩu chưa khớp.' : undefined}
              />
            </div>

            {pwError && (
              <p className="text-xs text-red-600 font-medium -mt-3">{pwError}</p>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={pwSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-sans font-bold uppercase tracking-wider transition-all duration-200 bg-white border border-stone-200/60 text-stone-700 hover:bg-stone-50 hover:border-red-200/60 disabled:opacity-50"
                style={{ fontFamily: 'inherit' }}
              >
                {pwSaving ? 'Đang xử lý...' : (
                  <>
                    <Lock size={15} strokeWidth={2} />
                    Cập nhật mật khẩu
                  </>
                )}
              </button>
            </div>
          </form>
        </Card>

        {/* ── Current Session ── */}
        <Card>
          <CardTitle>
            <Shield size={18} strokeWidth={1.5} className="text-red-900" />
            Phiên làm việc
          </CardTitle>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200/60">
              <div className="flex-1">
                <p className="text-sm font-bold text-stone-900">Đăng xuất phiên hiện tại</p>
                <p className="text-xs text-stone-400 mt-0.5">Rời khỏi ứng dụng trên trình duyệt này.</p>
              </div>
              <button
                onClick={handleLogout}
                className="shrink-0 px-4 py-2 rounded-lg text-xs font-sans font-bold uppercase tracking-wider transition-all bg-white border border-stone-200/60 text-stone-600 hover:bg-stone-50"
              >
                <span className="flex items-center gap-1.5">
                  <LogIn size={13} strokeWidth={2} />
                  Thoát
                </span>
              </button>
            </div>
          </div>
        </Card>

        {/* ── Danger Zone ── */}
        <Card className="border-red-200/60 bg-red-50/30">
          <CardTitle>
            <AlertTriangle size={18} strokeWidth={1.5} className="text-red-900" />
            Vùng nguy hiểm
          </CardTitle>
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white border border-red-200/60">
            <div className="flex-1">
              <p className="text-sm font-bold text-red-900">Xóa tài khoản vĩnh viễn</p>
              <p className="text-xs text-stone-500 mt-0.5">
                Hành động này <strong>không thể hoàn tác</strong>. Toàn bộ dữ liệu sẽ bị xóa vĩnh viễn.
              </p>
            </div>
            <button
              onClick={handleOpenDeleteDialog}
              className="shrink-0 px-4 py-2 rounded-lg text-xs font-sans font-bold uppercase tracking-wider transition-all bg-red-900 text-amber-50 hover:bg-red-950 shadow-sm"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={13} strokeWidth={2} />
                Xóa tài khoản
              </span>
            </button>
          </div>
        </Card>

        {/* ── Delete Account Confirmation Dialog ── */}
        <DeleteAccountDialog
          userName={currentUser?.fullName ?? 'Học sinh'}
          userEmail={currentUser?.email ?? ''}
          isOpen={showDeleteDialog}
          isDeleting={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      </div>
    </ProfileLayout>
  );
}
