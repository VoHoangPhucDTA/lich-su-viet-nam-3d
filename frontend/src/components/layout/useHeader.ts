import { createContext, useContext, type ReactNode } from 'react';

interface HeaderContextType {
  centerContent: ReactNode;
  setCenterContent: (content: ReactNode) => void;
}

export const HeaderContext = createContext<HeaderContextType | null>(null);

export function useHeader(): HeaderContextType {
  const context = useContext(HeaderContext);
  if (context) return context;

  // Preserve incremental adoption for pages rendered outside HeaderProvider.
  return { centerContent: null, setCenterContent: () => {} };
}
