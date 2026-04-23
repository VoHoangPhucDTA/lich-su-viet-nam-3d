import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Check localStorage
    const savedTheme = localStorage.getItem('mvp_kltn_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
    // Default to dark
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    // Apply data attribute for CSS variable contextual targeting
    root.setAttribute('data-theme', theme);
    
    // Also apply a class for potential tailwind dark: variant usage
    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    // Save choice
    localStorage.setItem('mvp_kltn_theme', theme);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark',
        isLight: theme === 'light',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
