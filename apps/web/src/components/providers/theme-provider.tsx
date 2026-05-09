'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyTheme,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_NAME,
  getStoredTheme,
  getStoredThemeMode,
  getSystemThemeMode,
  getTheme,
  themes,
} from '@/lib/themes';
import type { Theme, ThemeMode } from '@/lib/themes';
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
  setMode: (mode: ThemeMode) => void;
  toggleMode: (coords?: { x: number; y: number }) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultThemeName?: string;
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultThemeName = DEFAULT_THEME_NAME, initialMode }: ThemeProviderProps) {
  const { user } = useSession();
  const userTheme = user?.theme ?? null;
  const [theme, setThemeState] = useState(() =>
    getTheme(userTheme || defaultThemeName, initialMode ?? DEFAULT_THEME_MODE),
  );
  const themeName = theme.name;
  const mode = theme.resolvedTheme;

  useEffect(() => {
    const effectiveThemeName = getStoredTheme() || userTheme || defaultThemeName || DEFAULT_THEME_NAME;
    const effectiveThemeMode = getStoredThemeMode() || initialMode || getSystemThemeMode();
    const effectiveTheme = getTheme(effectiveThemeName, effectiveThemeMode);

    setThemeState(effectiveTheme);
    applyTheme(effectiveTheme);
  }, [defaultThemeName, initialMode, userTheme]);

  const setTheme = useCallback(
    (nextThemeName: string) => {
      const nextTheme = getTheme(nextThemeName, mode);
      setThemeState(nextTheme);
      applyTheme(nextTheme);
    },
    [mode],
  );

  const setMode = useCallback(
    (nextMode: ThemeMode) => {
      const nextTheme = getTheme(themeName, nextMode);
      setThemeState(nextTheme);
      applyTheme(nextTheme);
    },
    [themeName],
  );

  const toggleMode = useCallback(
    (coords?: { x: number; y: number }) => {
      const nextMode = mode === 'dark' ? 'light' : 'dark';
      const root = document.documentElement;
      const prefersReducedMotion = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!document.startViewTransition || prefersReducedMotion) {
        setMode(nextMode);
        return;
      }

      if (coords) {
        root.style.setProperty('--x', `${coords.x}px`);
        root.style.setProperty('--y', `${coords.y}px`);
      }

      document.startViewTransition(() => {
        setMode(nextMode);
      });
    },
    [mode, setMode],
  );

  useThemeSync(themeName);

  const contextValue: ThemeContextValue = useMemo(
    () => ({
      theme,
      themeName,
      themes,
      resolvedTheme: theme.resolvedTheme,
      isDark: theme.resolvedTheme === 'dark',
      setTheme,
      setMode,
      toggleMode,
    }),
    [setMode, setTheme, theme, themeName, toggleMode],
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
