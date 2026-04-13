'use client';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import type { Platform } from '@/types/platform';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import { usePlatformConfig } from '@/features/platform/hooks/usePlatform';

export const PlatformContext = createContext<Platform | null>(null);

export const PlatformContextProvider = ({
  children,
  initialPlatform,
}: {
  children: ReactNode;
  initialPlatform?: any;
}) => {
  const { data: platform, isPending: isPlatformLoading } = usePlatformConfig({
    initialData: initialPlatform || undefined,
    staleTime: initialPlatform ? 60_000 : 0,
  });

  // Only block on platform data — session state is independent of platform config.
  if (!platform && isPlatformLoading) return <PageLoading />;

  return <PlatformContext.Provider value={platform ?? null}>{children}</PlatformContext.Provider>;
};

export function usePlatform(): Platform | null {
  return use(PlatformContext);
}
