'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, getTheme } from '@/lib/themes';
import { loadTheme } from '@/lib/theme-lazy-loader';
import { useSession } from '@/hooks/useSession';
import { useThemeSync } from '@/hooks/useThemeSync';
import type { Theme } from '@/lib/themes';
import type { ReactNode } from 'react';

interface ThemeContextValue {
  theme: Theme;
  themeName: string;
  setTheme: (themeName: string, syncToServer?: boolean) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultThemeName?: string;
}

export function ThemeProvider({ children, defaultThemeName = 'default' }: ThemeProviderProps) {
  const { user } = useSession();
  const userTheme = user?.theme ?? null;
  const initialThemeName = userTheme || defaultThemeName;
  const [themeName, setThemeName] = useState(initialThemeName);
  const [isLoading, setIsLoading] = useState(false);

  const theme = getTheme(themeName);

  useEffect(() => {
    const effectiveTheme = getStoredTheme() || userTheme || defaultThemeName;

    if (effectiveTheme !== themeName) {
      setThemeName(effectiveTheme);
    }

    applyTheme(getTheme(effectiveTheme));
  }, [defaultThemeName, themeName, userTheme]);

  const setTheme = async (newThemeName: string, syncToServer = true) => {
    void syncToServer; // sync is handled by useThemeSync inside this provider
    setIsLoading(true);
    const newTheme = await loadTheme(newThemeName);
    setIsLoading(false);

    if (newTheme) {
      setThemeName(newThemeName);
      applyTheme(newTheme);
    } else {
      console.warn(`Failed to load theme: ${newThemeName}, falling back to default`);
      const fallbackTheme = getTheme('default');
      setThemeName('default');
      applyTheme(fallbackTheme);
    }
  };

  useThemeSync(themeName);

  const contextValue: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    isLoading,
  };

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
