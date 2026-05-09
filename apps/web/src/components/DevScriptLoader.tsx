'use client';

import { useEffect } from 'react';

const SCRIPT_ID = 'react-scan-auto-global';

export default function DevScriptLoader() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = '//unpkg.com/react-scan/dist/auto.global.js';
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.defer = true;
    // append to <head> so it's non-blocking for page content
    document.head.appendChild(s);

    return () => {
      // keep script loaded across navigations in dev; uncomment to clean up on unmount
      // document.getElementById(SCRIPT_ID)?.remove();
    };
  }, []);

  return null;
}
