import { createContext, useContext, useState, type ReactNode } from 'react';

interface HeaderContextType {
  centerContent: ReactNode;
  setCenterContent: (content: ReactNode) => void;
}

const HeaderContext = createContext<HeaderContextType | null>(null);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [centerContent, setCenterContent] = useState<ReactNode>(null);
  
  return (
    <HeaderContext.Provider value={{ centerContent, setCenterContent }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader() {
  const ctx = useContext(HeaderContext);
  if (!ctx) {
      // Return a dummy context instead of throwing to avoid breaking pages not wrapped in provider during incremental adoption
      return { centerContent: null, setCenterContent: () => {} };
  }
  return ctx;
}
