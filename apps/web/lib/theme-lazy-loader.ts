/**
 * Theme Lazy Loading System
 *
 * Loads themes on-demand to reduce initial bundle size and memory usage.
 * Core themes are loaded immediately, others are lazy-loaded.
 */

import { blackTheme, defaultTheme } from './theme-definitions';
import type { Theme } from './theme-utils';

// Core themes loaded immediately (most commonly used)
const CORE_THEMES = {
  default: defaultTheme,
  black: blackTheme,
} as const;

// Theme cache for lazy-loaded themes
const themeCache = new Map<string, Theme>();

// Initialize cache with core themes
for (const [name, theme] of Object.entries(CORE_THEMES)) {
  themeCache.set(name, theme);
}

/**
 * Lazy load a theme by name
 */
export async function loadTheme(name: string): Promise<Theme | null> {
  // Return cached theme if available
  if (themeCache.has(name)) {
    return themeCache.get(name) ?? null;
  }

  try {
    // Dynamically import theme from definitions file
    const { themes } = await import('./theme-definitions');
    const theme = themes.find((t) => t.name === name);

    if (theme) {
      themeCache.set(name, theme);
      return theme;
    }

    return null;
  } catch (error) {
    console.error(`Failed to load theme: ${name}`, error);
    return null;
  }
}

/**
 * Get all available theme names (without loading full theme data)
 */
export async function getAvailableThemeNames(): Promise<string[]> {
  try {
    const { themes } = await import('./theme-definitions');
    return themes.map((t) => t.name);
  } catch (error) {
    console.error('Failed to load theme names', error);
    return Object.keys(CORE_THEMES);
  }
}

/**
 * Preload multiple themes in the background
 */
export function preloadThemes(themeNames: string[]): void {
  // Use requestIdleCallback for non-blocking preloading
  if (typeof globalThis.window !== 'undefined' && 'requestIdleCallback' in globalThis) {
    globalThis.requestIdleCallback(() => {
      for (const name of themeNames) {
        loadTheme(name);
      }
    });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      for (const name of themeNames) {
        loadTheme(name);
      }
    }, 100);
  }
}

/**
 * Clear theme cache (useful for memory management)
 */
export function clearThemeCache(): void {
  // Keep only core themes
  const entries = [...themeCache.entries()];
  themeCache.clear();

  // Re-add core themes
  for (const [name, theme] of Object.entries(CORE_THEMES)) {
    themeCache.set(name, theme);
  }
}

/**
 * Get cache statistics
 */
export function getThemeCacheStats() {
  return {
    size: themeCache.size,
    themes: [...themeCache.keys()],
  };
}
