import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Menu,
  ChevronDown,
  Sparkles,
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
  const [examDropdownOpen, setExamDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const examDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (examDropdownRef.current && !examDropdownRef.current.contains(event.target as Node)) {
        setExamDropdownOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActiveTab = (path: string) => location.pathname.startsWith(path);

  const tabClass = (path: string) =>
    `relative px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors duration-300 ${
      isActiveTab(path)
        ? 'text-red-900'
        : 'text-stone-500 hover:text-red-900'
    }`;

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-stone-50/80 border-b border-stone-200/60 shadow-sm">
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
              <div className="font-serif text-lg sm:text-xl font-bold text-stone-900 leading-tight">
                Lịch Sử Việt Nam
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-400">
                Bảo tàng số học đường THPT
              </div>
            </div>
          </Link>
        </div>

        {/* ── Center: Nav Tabs (desktop) ── */}
        <div className="hidden md:flex items-center gap-1">
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
                Ôn luyện
              </NavLink>
            </>
          )}
        </div>

        {/* ── Right: Controls (desktop) ── */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          {/* Ôn luyện dropdown */}
          <div className="relative" ref={examDropdownRef}>
            <button
              onClick={() => setExamDropdownOpen(!examDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xl bg-stone-100 border border-stone-200/60 text-stone-500 hover:bg-stone-200/60 hover:text-red-900 transition-all duration-300"
            >
              <Sparkles size={13} strokeWidth={2} />
              Luyện tập
              <ChevronDown size={11} strokeWidth={2.5} className={examDropdownOpen ? 'rotate-180' : ''} style={{ transition: 'transform 0.2s' }} />
            </button>
            {examDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-stone-200/60 rounded-2xl shadow-lg p-2 z-20 flex flex-col gap-0.5">
                <DropdownLabel>Trắc nghiệm AI</DropdownLabel>
                <DropdownLink to="/quiz" onClick={() => setExamDropdownOpen(false)}>Làm trắc nghiệm</DropdownLink>
                <DropdownLink to="/quiz/generate" onClick={() => setExamDropdownOpen(false)}>Tạo câu hỏi AI</DropdownLink>
                <DropdownLink to="/quiz/history" onClick={() => setExamDropdownOpen(false)}>Lịch sử</DropdownLink>
                <div className="h-px bg-stone-200/60 my-1" />
                <DropdownLabel>Đề thi THPT</DropdownLabel>
                <DropdownLink to="/exams" onClick={() => setExamDropdownOpen(false)}>Luyện đề</DropdownLink>
                <DropdownLink to="/exams/lich-su" onClick={() => setExamDropdownOpen(false)}>Lịch sử luyện thi</DropdownLink>
              </div>
            )}
          </div>

          {/* Profile / Auth */}
          <div className="relative" ref={profileDropdownRef}>
            {isAuthenticated ? (
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xl bg-red-900/10 border border-red-900/20 text-red-900 hover:bg-red-900/20 transition-all duration-300"
              >
                {currentUser?.fullName || 'Hồ sơ'}
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-xl bg-red-900 text-white hover:bg-red-950 transition-all duration-300 shadow-sm"
              >
                Đăng nhập
              </button>
            )}

            {profileDropdownOpen && isAuthenticated && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-stone-200/60 rounded-2xl shadow-lg p-2 z-20 flex flex-col gap-0.5">
                <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400 border-b border-stone-100">
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
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200/60 text-stone-600"
          aria-label="Menu"
        >
          <Menu size={18} strokeWidth={2} />
        </button>
      </div>

      {/* ── Mobile menu ── */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-stone-200/60 bg-white/95 backdrop-blur-md px-4 py-4 space-y-3 animate-fade-in">
          <MobileLink to="/home" onClick={() => setMobileMenuOpen(false)}>Cội Nguồn</MobileLink>
          <MobileLink to="/browse" onClick={() => setMobileMenuOpen(false)}>Sử liệu</MobileLink>
          <MobileLink to="/periods" onClick={() => setMobileMenuOpen(false)}>Thời kỳ</MobileLink>
          <MobileLink to="/map" onClick={() => setMobileMenuOpen(false)}>Bản đồ 3D</MobileLink>
          <MobileLink to="/quiz" onClick={() => setMobileMenuOpen(false)}>Ôn luyện</MobileLink>
          <MobileLink to="/exams" onClick={() => setMobileMenuOpen(false)}>Đề thi THPT</MobileLink>
          <div className="h-px bg-stone-200/60" />
          {isAuthenticated ? (
            <>
              <MobileLink to="/profile/dashboard" onClick={() => setMobileMenuOpen(false)}>Hồ sơ</MobileLink>
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

function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-stone-400">
      {children}
    </div>
  );
}

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

function MobileLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-4 py-3 rounded-xl text-sm font-medium text-stone-700 hover:text-red-900 hover:bg-red-50 transition-colors no-underline"
    >
      {children}
    </Link>
  );
}
