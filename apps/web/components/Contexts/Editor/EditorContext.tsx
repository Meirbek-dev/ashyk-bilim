'use client';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import type { EditorMode } from '@components/Objects/Editor/core';

// Properly typed context
export const EditorProviderContext = createContext<EditorProviderState | null>(null);

export interface EditorProviderState {
  isEditable: boolean;
  mode?: EditorMode;
}

interface EditorProviderProps {
  children: ReactNode;
  options: EditorProviderState;
}

const EditorOptionsProvider = ({ children, options }: EditorProviderProps) => {
  return <EditorProviderContext.Provider value={options}>{children}</EditorProviderContext.Provider>;
};

export default EditorOptionsProvider;

export function useEditorProvider(): EditorProviderState {
  const context = use(EditorProviderContext);
  if (!context) {
    throw new Error('useEditorProvider must be used within an EditorOptionsProvider');
  }
  return context;
}
