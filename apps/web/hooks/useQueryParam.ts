'use client';

/**
 * useQueryParam — simple URL search param state.
 *
 * Uses window.history.pushState for shallow (no-refetch) URL updates,
 * which is equivalent to nuqs's `{ shallow: true }` option.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function useQueryParam(key: string, defaultValue = ''): [string, (value: string) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
      const query = params.toString();
      globalThis.history.pushState(null, '', query ? `${pathname}?${query}` : pathname);
    },
    [key, defaultValue, searchParams, pathname],
  );

  return [value, setValue];
}

/**
 * Reset multiple query params at once
 */
export function useClearQueryParams(keys: string[]): () => void {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    keys.forEach((k) => params.delete(k));
    const query = params.toString();
    globalThis.history.pushState(null, '', query ? `${pathname}?${query}` : pathname);
  }, [keys, pathname, searchParams]);
}
