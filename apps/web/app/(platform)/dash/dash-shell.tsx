'use client';

import DashMobileMenu from '@components/Dashboard/Menus/DashMobileMenu';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import DashSidebar from '@components/Dashboard/Menus/DashSidebar';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

const DashShell = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <div className="bg-background flex min-h-screen flex-col md:hidden">
        <div className="flex min-h-screen w-full flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</div>
        <DashMobileMenu />
      </div>

      <div className="hidden md:contents">
        <SidebarProvider>
          <DashSidebar className="z-50" />
          <SidebarInset className={cn('bg-background flex-1 min-w-0')}>{children}</SidebarInset>
        </SidebarProvider>
      </div>
    </>
  );
};

export default DashShell;
