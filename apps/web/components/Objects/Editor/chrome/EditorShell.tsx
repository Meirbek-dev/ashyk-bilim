'use client';

import type { ReactNode } from 'react';

interface EditorShellProps {
  children: ReactNode;
}

export function EditorShell({ children }: EditorShellProps) {
  return <div className="bg-background flex h-screen w-full flex-col">{children}</div>;
}
