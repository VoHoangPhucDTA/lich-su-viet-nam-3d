import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Brain,
  ChevronDown,
  Landmark,
  LogIn,
  Map as MapIcon,
  Menu,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useHeader } from './HeaderContext';
import ThemeToggle from '../theme/ThemeToggle';

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

  // Close dropdowns on outside click
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

  const basePillClasses = "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border border-transparent select-none";
  const inactiveVariant = "hover:bg-[var(--bg-surface)] hover:text-[var(--accent)] text-[var(--text-secondary)]";
  const activeVariant = "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30";

  return (
    <header 
      className="glass-map" 
      style={{ 
        padding: '10px 24px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        zIndex: 100, 
        position: 'relative',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
        boxShadow: '0 12px 24px -20px rgba(15, 23, 42, 0.5)'
      }}
    >
      
      {/* 1. Left: Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '300px', minWidth: '220px', flexShrink: 0 }}>
        <Landmark
          size={24}
          strokeWidth={2}
          style={{ color: 'var(--accent)' }}
        />
        <div className="hidden sm:block">
          <h1 style={{ fontSize: '16px', fontWeight: 700, background: 'linear-gradient(135deg, #6b8fb6, #4f6f95, #c29b4b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.01em', margin: 0 }}>
            Lịch Sử Việt Nam 3D
          </h1>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
            Khám phá lịch sử qua bản đồ tương tác
          </p>
        </div>
      </div>

      {/* 2. Center: Breadcrumbs (Map Context) */}
      <div style={{ flex: '1 1 auto', minWidth: 0, padding: '0 16px', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        {centerContent}
      </div>

      {/* 3. Right: Quick Nav Desktop */}
      <div className="hidden lg:flex items-center gap-3" style={{ flexShrink: 0 }}>
        
        {/* Nav: Bản đồ (Chỉ hiện nếu không ở /) */}
        {location.pathname !== '/' && (
          <NavLink 
             to="/"
             className={({ isActive }) => `${basePillClasses} ${isActive ? activeVariant : inactiveVariant}`}
             end
          >
             <MapIcon size={15} strokeWidth={2.2} />
             Quay lại bản đồ
          </NavLink>
        )}

        {/* Nav: Ôn luyện (Gộp Trắc nghiệm AI + Đề thi) */}
        <div className="relative" ref={examDropdownRef}>
            <button 
                onClick={() => setExamDropdownOpen(!examDropdownOpen)}
                className={`${basePillClasses} ${inactiveVariant}`}
            >
                <Brain size={15} strokeWidth={2.2} />
                Ôn luyện
                <ChevronDown size={13} strokeWidth={2.4} />
            </button>
            {examDropdownOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.5rem', width: '220px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                     <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', padding: '0.5rem 0.5rem 0.25rem 0.5rem', textTransform: 'uppercase' }}>Trắc nghiệm AI</div>
                     <Link to="/quiz" onClick={() => setExamDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Làm trắc nghiệm</Link>
                     <Link to="/quiz/history" onClick={() => setExamDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Lịch sử trắc nghiệm</Link>
                     <Link to="/quiz/generate" onClick={() => setExamDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Tạo câu hỏi AI</Link>
                     
                     <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }} />
                     
                     <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', padding: '0.5rem 0.5rem 0.25rem 0.5rem', textTransform: 'uppercase' }}>Đề thi THPT</div>
                     <Link to="/exams" onClick={() => setExamDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Luyện đề</Link>
                     <Link to="/exams/create" onClick={() => setExamDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Khởi tạo đề thi</Link>
                     <Link to="/exams/history" onClick={() => setExamDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Lịch sử làm đề</Link>
                </div>
            )}
        </div>

        {/* Nav: Tài khoản */}
        <div className="relative" ref={profileDropdownRef}>
            {isAuthenticated ? (
               <button 
                   onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                   className={`${basePillClasses} transition-all`}
                   style={{ 
                     background: 'var(--accent-soft)', 
                     color: 'var(--accent)',
                     border: '1px solid var(--accent)'
                   }}
               >
                   <User size={15} strokeWidth={2.2} />
                   {currentUser?.fullName || 'Hồ sơ'}
               </button>
            ) : (
               <button 
                  onClick={() => navigate('/login')}
                  className={`${basePillClasses} transition-all`}
                  style={{ 
                    background: 'var(--accent)', 
                    color: '#ffffff',
                    boxShadow: '0 4px 12px var(--accent-soft)'
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)';
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.filter = 'none';
                    (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                  }}
               >
                  <LogIn size={15} strokeWidth={2.2} />
                  Đăng nhập
               </button>
            )}

            {profileDropdownOpen && isAuthenticated && (
               <div style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.5rem', width: '200px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                   <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
                       Đăng nhập với vai trò:<br />
                       <strong style={{ color: 'var(--text-primary)' }}>{currentUser?.role === 'admin' ? 'Quản trị viên' : 'Học sinh'}</strong>
                   </div>
                   
                   <Link to="/profile/dashboard" onClick={() => setProfileDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Dashboard cá nhân</Link>
                   <Link to="/profile/history" onClick={() => setProfileDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Lịch sử học tập</Link>
                   <Link to="/profile/scores" onClick={() => setProfileDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Điểm số</Link>
                   <Link to="/profile/settings" onClick={() => setProfileDropdownOpen(false)} style={{ padding: '0.5rem', color: 'var(--text-primary)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }} className="hover:bg-surface">Cài đặt</Link>
                   
                   {currentUser?.role === 'admin' && (
                       <>
                          <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }} />
                          <Link
                            to="/admin/dashboard"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="hover:bg-surface flex items-center gap-2"
                            style={{ padding: '0.5rem', color: 'var(--warning)', textDecoration: 'none', borderRadius: '6px', fontSize: '0.85rem' }}
                          >
                            <ShieldCheck size={15} strokeWidth={2.2} />
                            Trang quản trị
                          </Link>
                       </>
                   )}
                   
                   <div style={{ height: '1px', background: 'var(--border)', margin: '0.25rem 0' }} />
                   {/* Bước 6D.1.1: AppHeader.tsx: Người dùng nhấp nút "Đăng xuất" (desktop dropdown) */}
                   <button 
                      onClick={async () => {
                        // Bước 6D.1.2: AppHeader.tsx: await logout() — bắt buộc await để navigate chạy sau khi state clear
                        await logout(); setProfileDropdownOpen(false); navigate('/');
                      }}
                      style={{ padding: '0.5rem', color: 'var(--danger)', textAlign: 'left', background: 'none', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
                      className="hover:bg-surface"
                   >
                     Đăng xuất
                   </button>
               </div>
            )}
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />


      </div>

      {/* Mobile Nav Trigger */}
      <div className="flex lg:hidden items-center gap-3">
         <ThemeToggle />

         <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Mở menu"
            className="flex items-center justify-center cursor-pointer p-1"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)' }}
         >
            <Menu size={22} strokeWidth={2.2} />
         </button>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'var(--shadow)' }}>
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:bg-surface flex items-center gap-2"
              style={{ padding: '0.75rem', background: 'var(--bg-app)', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none' }}
            >
              <MapIcon size={16} strokeWidth={2.2} />
              Bản đồ
            </Link>
            
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>ÔN LUYỆN</div>
            <Link to="/quiz" onClick={() => setMobileMenuOpen(false)} style={{ padding: '0.75rem', background: 'var(--bg-app)', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none' }} className="hover:bg-surface">Trắc nghiệm AI</Link>
            <Link to="/exams" onClick={() => setMobileMenuOpen(false)} style={{ padding: '0.75rem', background: 'var(--bg-app)', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none' }} className="hover:bg-surface">Đề thi Quốc Gia</Link>
            
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>TÀI KHOẢN</div>
            {isAuthenticated ? (
               <>
                 <Link to="/profile/dashboard" onClick={() => setMobileMenuOpen(false)} style={{ padding: '0.75rem', background: 'var(--bg-app)', borderRadius: '8px', color: 'var(--text-primary)', textDecoration: 'none' }} className="hover:bg-surface">Dashboard cá nhân</Link>
                 {currentUser?.role === 'admin' && (
                    <Link
                      to="/admin/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2"
                      style={{ padding: '0.75rem', background: 'var(--accent-soft)', borderRadius: '8px', color: 'var(--warning)', textDecoration: 'none' }}
                    >
                      <ShieldCheck size={16} strokeWidth={2.2} />
                      Trang quản trị
                    </Link>
                 )}
                 {/* Bước 6D.1.1: AppHeader.tsx: Người dùng nhấp nút "Đăng xuất" (mobile menu) */}
                 <button
                   onClick={async () => {
                     // Bước 6D.1.2: AppHeader.tsx: await logout() — bắt buộc await để navigate chạy sau khi state clear
                     await logout(); setMobileMenuOpen(false); navigate('/');
                   }}
                   style={{ padding: '0.75rem', background: 'transparent', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger)', textAlign: 'center', marginTop: '0.5rem' }}
                 >Đăng xuất</button>
               </>
            ) : (
               <Link to="/login" onClick={() => setMobileMenuOpen(false)} style={{ padding: '0.75rem', background: 'var(--accent)', borderRadius: '8px', color: '#fff', textDecoration: 'none', textAlign: 'center' }}>Đăng nhập</Link>
            )}
         </div>
      )}
    </header>
  );
}
