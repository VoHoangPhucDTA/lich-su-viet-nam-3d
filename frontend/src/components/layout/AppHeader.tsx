import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Menu,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useHeader } from './HeaderContext';

export default function AppHeader() {
  const { currentUser, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { centerContent } = useHeader();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const isActiveTab = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const tabClass = (path: string) =>
    `relative px-3 py-2 text-xs font-sans font-bold uppercase tracking-wide transition-colors duration-300 ${
      isActiveTab(path)
        ? 'text-red-900'
        : 'text-stone-500 hover:text-red-900'
    }`;

  return (
    <nav aria-label="Điều hướng chính" className="app-header sticky top-0 z-50 backdrop-blur-md bg-stone-50/80 border-b border-stone-200/60 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">

        {/* ── Left: Brand ── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link to="/home" className="flex items-center gap-3 group no-underline">
            {/* Compass motif */}
            <div className="relative w-10 h-10 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-amber-200/60 animate-spin-slow" />
              <div className="absolute inset-1 rounded-full border border-red-900/20" />
              <Globe size={18} strokeWidth={1.5} className="text-red-900 relative z-10 group-hover:rotate-45 transition-transform duration-500" />
            </div>
            <div className="hidden sm:block">
              <div className="app-brand-title text-lg sm:text-xl text-stone-900">
                Lịch Sử Việt Nam
              </div>
              <div className="app-brand-subtitle text-[10px] uppercase text-stone-500">
                Bảo tàng số học đường THPT
              </div>
            </div>
          </Link>
        </div>

        {/* ── Center: Nav Tabs (desktop) ── */}
        <div className="hidden lg:flex items-center gap-1">
          {centerContent ? (
            <div className="max-w-lg min-w-0 overflow-hidden">{centerContent}</div>
          ) : (
            <>
              <NavLink to="/home" className={tabClass('/home')} end>
                Cội Nguồn
              </NavLink>
              <NavLink to="/browse" className={tabClass('/browse')}>
                Sử liệu
              </NavLink>
              <NavLink to="/periods" className={tabClass('/periods')}>
                Thời kỳ
              </NavLink>
              <NavLink to="/map" className={tabClass('/map')}>
                Bản đồ
              </NavLink>
              <NavLink to="/quiz" className={tabClass('/quiz')}>
                Trắc nghiệm kiến thức
              </NavLink>
              <NavLink to="/exams" className={tabClass('/exams')}>
                Luyện thi THPT
              </NavLink>
            </>
          )}
        </div>

        {/* ── Right: Controls (desktop) ── */}
        <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
          {/* Profile / Auth */}
          <div className="relative" ref={profileDropdownRef}>
            {isAuthenticated ? (
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                aria-haspopup="true"
                aria-expanded={profileDropdownOpen}
                className="px-3 py-1.5 text-xs font-sans font-bold uppercase tracking-wide rounded-xl bg-red-900/10 border border-red-900/20 text-red-900 hover:bg-red-900/20 transition-all duration-300"
              >
                {currentUser?.fullName || 'Hồ sơ'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="px-4 py-2 text-xs font-sans font-bold uppercase tracking-wide rounded-xl bg-red-900 text-white hover:bg-red-950 transition-all duration-300 shadow-sm"
              >
                Đăng nhập
              </button>
            )}

            {profileDropdownOpen && isAuthenticated && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-stone-200/60 rounded-2xl shadow-lg p-2 z-20 flex flex-col gap-0.5">
                <div className="px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wide text-stone-500 border-b border-stone-100">
                  {currentUser?.role === 'admin' ? 'Quản trị viên' : 'Học sinh'}
                </div>
                <DropdownLink to="/profile/dashboard" onClick={() => setProfileDropdownOpen(false)}>Dashboard</DropdownLink>
                <DropdownLink to="/profile/history" onClick={() => setProfileDropdownOpen(false)}>Lịch sử</DropdownLink>
                <DropdownLink to="/profile/settings" onClick={() => setProfileDropdownOpen(false)}>Cài đặt</DropdownLink>
                {currentUser?.role === 'admin' && (
                  <>
                    <div className="h-px bg-stone-200/60 my-1" />
                    <DropdownLink to="/admin/dashboard" onClick={() => setProfileDropdownOpen(false)}>
                      <ShieldCheck size={13} strokeWidth={2} />
                      Quản trị
                    </DropdownLink>
                  </>
                )}
                <div className="h-px bg-stone-200/60 my-1" />
                <button
                  onClick={async () => { await logout(); setProfileDropdownOpen(false); navigate('/home'); }}
                  className="w-full text-left px-3 py-2 text-xs text-red-900 hover:bg-red-50 rounded-lg transition-colors font-medium"
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile toggle ── */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden w-11 h-11 flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200/60 text-stone-600"
          aria-label="Menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="app-mobile-navigation"
        >
          <Menu size={18} strokeWidth={2} />
        </button>
      </div>

      {/* ── Mobile menu ── */}
      {mobileMenuOpen && (
        <div id="app-mobile-navigation" className="lg:hidden border-t border-stone-200/60 bg-white/95 backdrop-blur-md px-4 py-4 space-y-1 animate-fade-in">
          <MobileLink to="/home" active={isActiveTab('/home')} onClick={() => setMobileMenuOpen(false)}>Cội Nguồn</MobileLink>
          <MobileLink to="/browse" active={isActiveTab('/browse')} onClick={() => setMobileMenuOpen(false)}>Sử liệu</MobileLink>
          <MobileLink to="/periods" active={isActiveTab('/periods')} onClick={() => setMobileMenuOpen(false)}>Thời kỳ</MobileLink>
          <MobileLink to="/map" active={isActiveTab('/map')} onClick={() => setMobileMenuOpen(false)}>Bản đồ 3D</MobileLink>
          <MobileLink to="/quiz" active={isActiveTab('/quiz')} onClick={() => setMobileMenuOpen(false)}>Trắc nghiệm kiến thức</MobileLink>
          <MobileLink to="/exams" active={isActiveTab('/exams')} onClick={() => setMobileMenuOpen(false)}>Luyện thi THPT</MobileLink>
          <div className="h-px bg-stone-200/60" />
          {isAuthenticated ? (
            <>
              <MobileLink to="/profile/dashboard" active={isActiveTab('/profile')} onClick={() => setMobileMenuOpen(false)}>Hồ sơ</MobileLink>
              <button
                onClick={async () => { await logout(); setMobileMenuOpen(false); navigate('/home'); }}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-red-900 hover:bg-red-50 transition-colors"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <button
              onClick={() => { setMobileMenuOpen(false); navigate('/login'); }}
              className="w-full px-4 py-3 rounded-xl bg-red-900 text-white text-sm font-bold hover:bg-red-950 transition-colors text-center"
            >
              Đăng nhập
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

/* ─── Dropdown helpers ─── */

function DropdownLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-xs text-stone-700 hover:text-red-900 hover:bg-red-50 rounded-lg transition-all duration-200 no-underline font-medium"
    >
      {children}
    </Link>
  );
}

function MobileLink({ to, active, onClick, children }: { to: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`block min-h-11 px-4 py-3 rounded-xl text-sm font-medium transition-colors no-underline ${
        active ? 'bg-red-50 text-red-900 font-bold' : 'text-stone-700 hover:text-red-900 hover:bg-red-50'
      }`}
    >
      {children}
    </Link>
  );
}
