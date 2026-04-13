'use client';

import DashMobileMenu from '@components/Dashboard/Menus/DashMobileMenu';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import DashSidebar from '@components/Dashboard/Menus/DashSidebar';
import type { ReactNode } from 'react';

const DashShell = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <div className="flex flex-col md:hidden">
        <DashMobileMenu />
        <div className="flex w-full">{children}</div>
      </div>

      <div className="hidden md:contents">
        <SidebarProvider>
          <DashSidebar className="z-50" />
          <SidebarInset className="bg-background/30 flex-1">{children}</SidebarInset>
        </SidebarProvider>
      </div>
    </>
  );
};

export default DashShell;
