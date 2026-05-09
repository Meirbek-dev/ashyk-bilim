/**
 * useReducedMotion Hook
 *
 * Respects user's system preference for reduced motion (prefers-reduced-motion).
 * Returns true if user prefers reduced motion.
 */

import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof globalThis.window === 'undefined') return false;
    return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    // Check media query on mount
    const mediaQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');

    // Listen for changes
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', handleChange);
    } else if ('addListener' in mediaQuery) {
      // Backwards compatibility
      // @ts-ignore
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if ('removeEventListener' in mediaQuery) {
        mediaQuery.removeEventListener('change', handleChange);
      } else if ('removeListener' in mediaQuery) {
        // @ts-ignore
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  return prefersReducedMotion;
}
