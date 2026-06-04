import { Moon, Sun } from 'lucide-react';
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
      aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
    >
      <span className="relative flex w-5 h-5 items-center justify-center overflow-hidden">
        {isDark ? (
          <Sun size={20} strokeWidth={2.4} className="animate-fade-in" />
        ) : (
          <Moon size={20} strokeWidth={2.4} className="animate-fade-in" />
        )}
      </span>

      <span className="hidden sm:inline transition-colors duration-300">
        {isDark ? 'Chế độ sáng' : 'Chế độ tối'}
      </span>
    </button>
  );
}
