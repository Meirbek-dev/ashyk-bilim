/**
 * useReducedData Hook
 *
 * Detects users on slow/expensive connections via:
 * 1. prefers-reduced-data (new standard)
 * 2. navigator.connection.saveData
 * 3. navigator.connection.effectiveType (slow-2g, 2g)
 *
 * Returns true if user prefers reduced data usage.
 */

import { useEffect, useState } from 'react';

export function useReducedData(): boolean {
  const [prefersReducedData, setPrefersReducedData] = useState(() => {
    if (typeof globalThis.window === 'undefined') return false;

    // Check multiple signals
    let reduced = false;

    // 1. Check prefers-reduced-data media query (new standard)
    const mediaQuery = globalThis.matchMedia('(prefers-reduced-data: reduce)');
    if (mediaQuery.matches) {
      reduced = true;
    }

    // 2. Check Network Information API (saveData)
    const connection =
      (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      // Check saveData
      if (connection.saveData) {
        reduced = true;
      }
      // Check slow connection types
      if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
        reduced = true;
      }
    }

    return reduced;
  });

  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;

    const mediaQuery = globalThis.matchMedia('(prefers-reduced-data: reduce)');
    const connection =
      (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

    // Compute initial state synchronously (already computed in useState initializer)
    const initialReduced = Boolean(
      mediaQuery.matches ||
      (connection &&
        (connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g')),
    );

    // Handlers
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedData(event.matches);
    };

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', handleChange);
    } else if ('addListener' in mediaQuery) {
      // Backwards compatibility
      // @ts-ignore
      mediaQuery.addListener(handleChange);
    }

    let prevOnChange: any = null;
    const handleNetworkChange = () => {
      const saveData = connection?.saveData === true;
      const slowConnection = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
      setPrefersReducedData(saveData || slowConnection || mediaQuery.matches);
    };

    if (connection) {
      if ('addEventListener' in connection) {
        connection.addEventListener('change', handleNetworkChange);
      } else {
        // preserve existing handler if any
        prevOnChange = connection.onchange;
        // @ts-ignore
        connection.onchange = handleNetworkChange;
      }
    }

    return () => {
      if ('removeEventListener' in mediaQuery) {
        mediaQuery.removeEventListener('change', handleChange);
      } else if ('removeListener' in mediaQuery) {
        // @ts-ignore
        mediaQuery.removeListener(handleChange);
      }

      if (connection) {
        if ('removeEventListener' in connection) {
          connection.removeEventListener('change', handleNetworkChange);
        } else {
          // restore previous handler if it existed
          // @ts-ignore
          connection.onchange = prevOnChange;
        }
      }
    };
  }, []);

  return prefersReducedData;
}
