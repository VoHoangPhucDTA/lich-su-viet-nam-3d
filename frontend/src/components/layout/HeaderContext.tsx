import { useState, type ReactNode } from 'react';
import { HeaderContext } from './useHeader';

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [centerContent, setCenterContent] = useState<ReactNode>(null);
  
  return (
    <HeaderContext.Provider value={{ centerContent, setCenterContent }}>
      {children}
    </HeaderContext.Provider>
  );
}
