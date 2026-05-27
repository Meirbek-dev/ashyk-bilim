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
      {/* Content area offset via CSS — resilient to viewport/notch changes */}
      <div style={{ paddingTop: NAVBAR_HEIGHT }}>{children}</div>
    </GamificationProvider>
  );
}

