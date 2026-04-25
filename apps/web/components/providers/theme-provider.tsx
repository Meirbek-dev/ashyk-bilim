'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, DEFAULT_THEME_NAME, getStoredTheme, getTheme, themes, type Theme, type ThemeMode } from '@/lib/themes';
import { useSession } from '@/hooks/useSession';
import { useThemeSync } from '@/hooks/useThemeSync';
import type { ReactNode } from 'react';

interface ThemeContextValue {
  theme: Theme;
  themeName: string;
  themes: readonly Theme[];
  resolvedTheme: ThemeMode;
  isDark: boolean;
  setTheme: (themeName: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultThemeName?: string;
}

export function ThemeProvider({ children, defaultThemeName = DEFAULT_THEME_NAME }: ThemeProviderProps) {
  const { user } = useSession();
  const userTheme = user?.theme ?? null;
  const initialThemeName = getTheme(userTheme || defaultThemeName).name;
  const [themeName, setThemeName] = useState(initialThemeName);
  const theme = getTheme(themeName);

  useEffect(() => {
    const effectiveThemeName = getStoredTheme() || userTheme || defaultThemeName || DEFAULT_THEME_NAME;
    const effectiveTheme = getTheme(effectiveThemeName);

    if (effectiveTheme.name !== themeName) {
      setThemeName(effectiveTheme.name);
    }

    applyTheme(effectiveTheme);
  }, [defaultThemeName, themeName, userTheme]);

  const setTheme = (nextThemeName: string) => {
    const nextTheme = getTheme(nextThemeName);
    setThemeName(nextTheme.name);
    applyTheme(nextTheme);
  };

  useThemeSync(themeName);

  const contextValue: ThemeContextValue = useMemo(
    () => ({
      theme,
      themeName,
      themes,
      resolvedTheme: theme.resolvedTheme,
      isDark: theme.resolvedTheme === 'dark',
      setTheme,
    }),
    [theme, themeName],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
