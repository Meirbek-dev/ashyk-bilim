'use client';

import { useMemo } from 'react';

export function useCodeArenaLayout() {
  const horizontalStorage = useMemo(() => ({
    getItem: (name: string) => {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(`code-arena:layout-horizontal:${name}`);
    },
    setItem: (name: string, value: string) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(`code-arena:layout-horizontal:${name}`, value);
    },
  }), []);

  const verticalStorage = useMemo(() => ({
    getItem: (name: string) => {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(`code-arena:layout-vertical:${name}`);
    },
    setItem: (name: string, value: string) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(`code-arena:layout-vertical:${name}`, value);
    },
  }), []);

  return { horizontalStorage, verticalStorage };
}
