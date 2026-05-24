'use client';

import { useEffect, useMemo, useState } from 'react';

export interface CodeEditorPreferences {
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
}

const DEFAULT_PREFERENCES: CodeEditorPreferences = {
  fontSize: 14,
  wordWrap: true,
  minimap: true,
};

const STORAGE_KEY = 'code-arena:editor-preferences:v1';

export function useEditorPreferences() {
  const [preferences, setPreferences] = useState<CodeEditorPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<CodeEditorPreferences>;
      setPreferences({
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : DEFAULT_PREFERENCES.fontSize,
        wordWrap: typeof parsed.wordWrap === 'boolean' ? parsed.wordWrap : DEFAULT_PREFERENCES.wordWrap,
        minimap: typeof parsed.minimap === 'boolean' ? parsed.minimap : DEFAULT_PREFERENCES.minimap,
      });
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const monacoOptions = useMemo(
    () => ({
      fontSize: preferences.fontSize,
      minimap: { enabled: preferences.minimap },
      wordWrap: preferences.wordWrap ? ('on' as const) : ('off' as const),
    }),
    [preferences],
  );

  return { preferences, setPreferences, monacoOptions };
}
