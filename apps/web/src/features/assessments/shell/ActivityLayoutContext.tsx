'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Layout mode for the student activity page.
 *
 * - CONTENT: default layout (outline rail + content zone)
 * - PREFLIGHT: assessment entry card is shown
 * - ACTIVE_ATTEMPT: full-width takeover — outline rail hidden, global nav hidden
 * - RESULT: post-submit result card shown
 *
 * The mode is reflected on `document.documentElement.dataset.layoutMode` so
 * CSS and the global nav can react without prop-drilling.
 */
export type ActivityLayoutMode = 'CONTENT' | 'PREFLIGHT' | 'ACTIVE_ATTEMPT' | 'RESULT';

/**
 * An action that a nested component (e.g. InlineAssessmentWorkspace) can
 * register to be rendered as the primary CTA in BottomActionBar.
 * When set, it overrides the runtime.primary_action CTA.
 */
export interface BottomBarActionOverride {
  label: string;
  handler: () => void;
  isPending?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

interface ActivityLayoutContextValue {
  mode: ActivityLayoutMode;
  setMode: (mode: ActivityLayoutMode) => void;
  /** Override the primary CTA rendered by BottomActionBar. Null = use runtime action. */
  bottomBarAction: BottomBarActionOverride | null;
  setBottomBarAction: (action: BottomBarActionOverride | null) => void;
}

const ActivityLayoutContext = createContext<ActivityLayoutContextValue>({
  mode: 'CONTENT',
  setMode: () => undefined,
  bottomBarAction: null,
  setBottomBarAction: () => undefined,
});

export function ActivityLayoutProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ActivityLayoutMode>('CONTENT');
  const [bottomBarAction, setBottomBarActionState] = useState<BottomBarActionOverride | null>(null);

  const setMode = useCallback((next: ActivityLayoutMode) => {
    setModeState(next);
  }, []);

  const setBottomBarAction = useCallback((action: BottomBarActionOverride | null) => {
    setBottomBarActionState(action);
  }, []);

  // Keep the DOM attribute in sync so nav-menu and CSS can react
  useEffect(() => {
    const slug = mode.toLowerCase().replace(/_/g, '-');
    document.documentElement.dataset.layoutMode = slug;
    return () => {
      delete document.documentElement.dataset.layoutMode;
    };
  }, [mode]);

  const value = useMemo(
    () => ({ mode, setMode, bottomBarAction, setBottomBarAction }),
    [mode, setMode, bottomBarAction, setBottomBarAction],
  );

  return <ActivityLayoutContext.Provider value={value}>{children}</ActivityLayoutContext.Provider>;
}

export function useActivityLayout(): ActivityLayoutContextValue {
  return useContext(ActivityLayoutContext);
}
