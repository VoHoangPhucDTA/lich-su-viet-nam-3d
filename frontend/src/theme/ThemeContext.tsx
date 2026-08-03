import { createContext, useEffect } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (_theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.add('light');
  }, []);

  const value: ThemeContextType = {
    theme: 'light',
    setTheme: () => {},
    toggleTheme: () => {},
    isDark: false,
    isLight: true,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
