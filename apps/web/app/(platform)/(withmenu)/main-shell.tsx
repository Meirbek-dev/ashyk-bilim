'use client';

import { GamificationProvider } from '@/components/Contexts/GamificationContext';
import NavBar from '@/components/Objects/Menus/nav-menu';
import { NAVBAR_HEIGHT } from '@/lib/constants';
import type { ReactNode } from 'react';

interface MainShellProps {
  children: ReactNode;
}

export default function MainShell({ children }: MainShellProps) {
  return (
    <GamificationProvider>
      <NavBar />
      <div style={{ height: NAVBAR_HEIGHT }} />
      {children}
    </GamificationProvider>
  );
}
