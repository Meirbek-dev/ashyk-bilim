/**
 * Theme color utilities for UI components
 * Handles OKLCH color conversion for proper display
 */

import type { Theme } from './themes';

/**
 * Convert OKLCH color to a displayable format
 * OKLCH is natively supported by modern browsers, so we just return it
 * For older browsers, the CSS will fallback gracefully
 *
 * @param oklchColor - Color in OKLCH format (e.g., "oklch(0.6231 0.188 259.8145)")
 * @returns The OKLCH color string ready for inline styles
 */
export function getDisplayColor(oklchColor: string): string {
  // OKLCH is natively supported in all modern browsers (Safari 15.4+, Chrome 111+, Firefox 113+)
  // No conversion needed, just return the value
  return oklchColor;
}

/**
 * Get theme preview colors for UI display
 * Returns the primary, secondary, and accent colors from a theme
 *
 * @param theme - Theme object with colors
 * @returns Object with display-ready color values
 */
export function getThemePreviewColors(theme: Pick<Theme, 'colors'>) {
  return {
    primary: getDisplayColor(theme.colors.primary),
    secondary: getDisplayColor(theme.colors.secondary),
    accent: getDisplayColor(theme.colors.accent),
  };
}
