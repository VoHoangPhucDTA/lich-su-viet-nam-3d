import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import UserAvatar from '../components/profile/UserAvatar';
import {
  LayoutDashboard,
  ScrollText,
  Award,
  Bot,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

/* ─── Nav items ─────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { to: '/profile/dashboard', icon: LayoutDashboard, label: 'Tổng quan' },
  { to: '/profile/history', icon: ScrollText, label: 'Lịch sử học tập' },
  { to: '/profile/scores', icon: Award, label: 'Điểm số' },
  { to: '/quiz', icon: Bot, label: 'Trắc nghiệm AI' },
  { to: '/exams', icon: FileText, label: 'Đề thi THPT' },
  { to: '/profile/settings', icon: Settings, label: 'Cài đặt' },
];


/* ─── Sidebar ────────────────────────────────────────────────────────────────── */
function Sidebar({ onClose }: { onClose?: () => void }) {
  const { currentUser, logout } = useAuth();
  const name = currentUser?.fullName ?? 'Học sinh';

  return (
    <div className="flex flex-col h-full py-5 px-3 gap-0.5 overflow-y-auto shrink-0"
      style={{
        width: '15rem',
        background: '#fafaf9',
        borderRight: '1px solid #e7e5e4',
      }}>
      {/* User info */}
      <div className="flex items-center gap-3 px-2.5 pb-4 mb-3 border-b border-stone-200">
        <UserAvatar fullName={name} avatarUrl={currentUser?.avatarUrl} size="md" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-stone-900 truncate">{name}</div>
          {currentUser?.grade && (
            <div className="text-xs text-stone-400">
              {currentUser.grade === 'other' ? 'Khác' : `Lớp ${currentUser.grade}`}
              {currentUser.school ? ` · ${currentUser.school}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 no-underline"
            style={({ isActive }) => ({
              color: isActive ? '#fff' : '#57534e',
              background: isActive ? '#8b1e1e' : 'transparent',
              border: isActive ? '1px solid #8b1e1e' : '1px solid transparent',
            })}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (!el.href.includes(window.location.pathname)) {
                el.style.background = '#f5f5f4';
                el.style.color = '#1c1917';
              }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              if (!el.href.includes(window.location.pathname)) {
                el.style.background = 'transparent';
                el.style.color = '#57534e';
              }
            }}
          >
            <Icon size={16} strokeWidth={1.8} className="shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Logout */}
      <button
        onClick={async () => {
          try { await logout(); } catch { /* ignore */ }
          window.location.href = '/login';
        }}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:text-red-900 hover:bg-red-50 transition-all duration-150 cursor-pointer"
        style={{ background: 'transparent', border: 'none', fontFamily: 'inherit' }}
      >
        <LogOut size={16} strokeWidth={1.8} />
        <span>Đăng xuất</span>
      </button>
    </div>
  );
}


/* ─── ProfileLayout ──────────────────────────────────────────────────────────── */
export default function ProfileLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#fafaf9]" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          />
        )}

        {/* Sidebar */}
        <div
          className={`fixed lg:static inset-y-0 left-0 z-50 transform transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main */}
        <main className="flex-1 overflow-y-auto relative">
          {/* Mobile hamburger - floating */}
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="fixed bottom-4 left-4 z-30 lg:hidden w-11 h-11 rounded-xl bg-white border border-stone-200 shadow-md flex items-center justify-center transition-all active:scale-95"
            aria-label="Menu"
          >
            {sidebarOpen ? (
              <X size={18} strokeWidth={2} className="text-stone-600" />
            ) : (
              <Menu size={18} strokeWidth={2} className="text-stone-600" />
            )}
          </button>

          {/* Content */}
          <div className="px-4 sm:px-6 lg:px-8 py-8 lg:py-10 max-w-4xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Desktop sidebar always visible */}
      <style>{`
        @media (max-width: 1023px) {
          .lg\\:translate-x-0 {
            transform: translateX(-100%) !important;
          }
        }
      `}</style>
    </div>
  );
}
