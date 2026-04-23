import { useTheme } from '../../theme/ThemeContext';

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`group flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-all duration-300 border cursor-pointer select-none active:scale-95
        ${isDark 
          ? 'bg-slate-800/80 hover:bg-slate-700 text-indigo-300 border-slate-700 hover:border-indigo-500/50 shadow-lg shadow-indigo-500/10' 
          : 'bg-white/80 hover:bg-slate-50 text-indigo-600 border-slate-200 hover:border-indigo-400 shadow-md shadow-indigo-200/50'
        }
      `}
      aria-label={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
    >
      <div className="relative w-5 h-5 flex items-center justify-center overflow-hidden">
        {isDark ? (
          /* Sun Icon */
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="w-full h-full animate-fade-in"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          /* Moon Icon */
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="w-full h-full animate-fade-in"
          >
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </div>
      
      <span className="hidden sm:inline transition-colors duration-300">
        {isDark ? 'Chế độ sáng' : 'Chế độ tối'}
      </span>
    </button>
  );
}
