'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Layout mode for the student activity page.
 *
 * - CONTENT: default 3-column layout (outline + content + action panel)
 * - PREFLIGHT: assessment entry card is shown instead of AssessmentHandoff
 * - ACTIVE_ATTEMPT: full-width takeover — sidebars hidden, nav hidden
 * - RESULT: post-submit result card shown, layout returns to 3-column
 *
 * The mode is reflected on `document.documentElement.dataset.layoutMode` so
 * CSS and the global nav can react without prop-drilling.
 */
export type ActivityLayoutMode = 'CONTENT' | 'PREFLIGHT' | 'ACTIVE_ATTEMPT' | 'RESULT';

interface ActivityLayoutContextValue {
  mode: ActivityLayoutMode;
  setMode: (mode: ActivityLayoutMode) => void;
}

const ActivityLayoutContext = createContext<ActivityLayoutContextValue>({
  mode: 'CONTENT',
  setMode: () => undefined,
});

export function ActivityLayoutProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ActivityLayoutMode>('CONTENT');

  const setMode = useCallback((next: ActivityLayoutMode) => {
    setModeState(next);
  }, []);

  // Keep the DOM attribute in sync so nav-menu and CSS can react
  useEffect(() => {
    const slug = mode.toLowerCase().replace(/_/g, '-');
    document.documentElement.dataset.layoutMode = slug;
    return () => {
      delete document.documentElement.dataset.layoutMode;
    };
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <ActivityLayoutContext.Provider value={value}>{children}</ActivityLayoutContext.Provider>;
}

export function useActivityLayout(): ActivityLayoutContextValue {
  return useContext(ActivityLayoutContext);
}
