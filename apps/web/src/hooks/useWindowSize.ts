import { useEffect, useState } from 'react';

export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof globalThis.window !== 'undefined' ? window.innerWidth : 0,
    height: typeof globalThis.window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;
    let rafId: number | null = null;
    function handleResize() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      });
    }

    const listenerOptions = { passive: true } as any;
    window.addEventListener('resize', handleResize, listenerOptions);

    // Call handler right away so state gets updated with initial window size
    handleResize();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize, listenerOptions);
    };
  }, []);

  return windowSize;
}
