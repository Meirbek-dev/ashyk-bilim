'use client';

import DashMobileMenu from '@components/Dashboard/Menus/DashMobileMenu';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import DashSidebar from '@components/Dashboard/Menus/DashSidebar';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
const DashShell = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider defaultOpen>
      <DashSidebar className="z-50" />
      <SidebarInset className={cn('bg-background flex min-w-0 flex-1 flex-col')}>
        {/* Main Content Area - Rendered exactly once */}
        <main className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>

        {/* Mobile Navigation - Only visible on small screens */}
        <div className="md:hidden">
          <DashMobileMenu />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default DashShell;
