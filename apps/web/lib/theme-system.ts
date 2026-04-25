/**
 * Theme system exports
 * Centralized exports for theme-related components and utilities
 *
 * Optimized for performance with lazy loading and memoization
 */

// Theme components
export { ThemeSelector } from '@components/ui/custom/theme-selector';
export { ThemeProvider, useTheme } from '@/components/providers/theme-provider';

// Core theme utilities
export {
  DEFAULT_THEME_NAME,
  THEME_STORAGE_KEY,
  applyTheme,
  darkThemeNames,
  getStoredTheme,
  getTheme,
  isDarkThemeName,
  themeNames,
  themes,
  type Theme,
  type ThemeColors,
  type ThemeMode,
  type ThemeTokenMap,
} from '@/lib/themes';

// Color utilities for UI components
export { getDisplayColor, getThemePreviewColors } from '@/lib/theme-color-utils';
