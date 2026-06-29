import { useEffect, useRef } from 'react';
import { AlertTriangle, X, Shield, User } from 'lucide-react';
import UserAvatar from './UserAvatar';

interface DeleteAccountDialogProps {
  /** The user's full name (for display in the warning) */
  userName: string;
  /** The user's email (for display in the warning) */
  userEmail: string;
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Whether a delete request is in progress */
  isDeleting: boolean;
  /** Called when the user confirms deletion */
  onConfirm: () => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

export default function DeleteAccountDialog({
  userName,
  userEmail,
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteAccountDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isDeleting, onCancel]);

  // Trap focus inside dialog when open
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const firstButton = dialogRef.current.querySelector('button');
    firstButton?.focus();
  }, [isOpen]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in"
      style={{
        background: 'rgba(28, 25, 23, 0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) onCancel(); }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl bg-white border border-stone-200/60 shadow-2xl overflow-hidden animate-fade-in-up"
        style={{ animationDuration: '0.25s' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
      >
        {/* ── Top accent bar ── */}
        <div className="h-1.5 w-full bg-gradient-to-r from-red-900 via-red-700 to-amber-500/50" />

        {/* ── Content ── */}
        <div className="p-6 sm:p-7 space-y-6">
          {/* Header row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: 'rgba(139, 30, 30, 0.1)',
                  color: '#8b1e1e',
                  border: '1px solid rgba(139, 30, 30, 0.15)',
                }}
              >
                <AlertTriangle size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2
                  id="delete-account-title"
                  className="font-serif text-xl font-black text-stone-900 leading-tight"
                >
                  Xóa tài khoản vĩnh viễn
                </h2>
                <p className="text-xs text-stone-400 mt-0.5 font-mono uppercase tracking-wider font-bold">
                  Hành động không thể hoàn tác
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer disabled:opacity-30"
              style={{
                background: 'transparent',
                border: '1px solid #e7e5e4',
                color: '#78716c',
              }}
              onMouseEnter={e => {
                if (!isDeleting) {
                  e.currentTarget.style.background = '#8b1e1e';
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.borderColor = '#8b1e1e';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#78716c';
                e.currentTarget.style.borderColor = '#e7e5e4';
              }}
              aria-label="Đóng"
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          </div>

          {/* Warning message */}
          <div
            className="rounded-xl p-4 space-y-2.5"
            style={{
              background: 'rgba(139, 30, 30, 0.06)',
              border: '1px solid rgba(139, 30, 30, 0.12)',
            }}
          >
            <div className="flex items-start gap-3">
              <Shield size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" style={{ color: '#8b1e1e' }} />
              <p className="text-sm text-stone-700 leading-relaxed">
                Tài khoản của bạn sẽ bị xóa vĩnh viễn. Toàn bộ dữ liệu sau đây sẽ mất và{' '}
                <strong className="text-red-900">không thể khôi phục</strong>:
              </p>
            </div>
            <ul className="list-disc ml-5 space-y-1 text-xs text-stone-500 pl-3">
              <li>Lịch sử học tập và điểm số</li>
              <li>Thông tin cá nhân và ảnh đại diện</li>
              <li>Tiến trình ôn luyện và thành tích</li>
            </ul>
          </div>

          {/* Account info */}
          <div
            className="flex items-center gap-3 rounded-xl p-3.5"
            style={{
              background: '#fafaf9',
              border: '1px solid #e7e5e4',
            }}
          >
            <UserAvatar fullName={userName} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-stone-900 truncate">{userName}</p>
              <p className="text-xs text-stone-400 truncate">{userEmail}</p>
            </div>
            <User size={16} strokeWidth={1.5} className="shrink-0 text-stone-300" />
          </div>

          {/* Final confirmation prompt */}
          <p className="text-xs text-stone-500 text-center leading-relaxed">
            Bạn có chắc chắn muốn xóa tài khoản này?{' '}
            <span className="font-bold text-red-900">Hành động này KHÔNG THỂ HOÀN TÁC.</span>
          </p>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="flex-1 px-5 py-3 rounded-xl text-sm font-mono font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer disabled:opacity-40"
              style={{
                background: '#fff',
                border: '1px solid #e7e5e4',
                color: '#57534e',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                if (!isDeleting) {
                  e.currentTarget.style.background = '#f5f5f4';
                  e.currentTarget.style.borderColor = '#d6d3d1';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = '#e7e5e4';
              }}
            >
              Hủy
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 px-5 py-3 rounded-xl text-sm font-mono font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer disabled:opacity-40"
              style={{
                background: '#8b1e1e',
                border: 'none',
                color: '#fef2f2',
                boxShadow: '0 4px 12px rgba(139, 30, 30, 0.3)',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                if (!isDeleting) {
                  e.currentTarget.style.background = '#6b1515';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 30, 30, 0.4)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#8b1e1e';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 30, 30, 0.3)';
              }}
            >
              {isDeleting ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                    style={{ animation: 'spin 0.6s linear infinite' }}
                  />
                  Đang xóa...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <AlertTriangle size={14} strokeWidth={2.5} />
                  Xác nhận xóa
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
