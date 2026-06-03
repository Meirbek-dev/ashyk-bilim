'use client'

import type { Platform } from '@/types/platform'
import { createContext, use } from 'react'
import type { ReactNode } from 'react'
import { usePlatformConfig } from '@/features/platform/hooks/usePlatform'

const PlatformContext = createContext<Platform | null>(null)

export const PlatformContextProvider = ({
  children,
  initialPlatform,
}: {
  children: ReactNode
  initialPlatform?: unknown
}) => {
  return <PlatformContext.Provider value={initialPlatform ?? null}>{children}</PlatformContext.Provider>
}

export function usePlatform(): Platform | null {
  const platform = use(PlatformContext)
  const { data } = usePlatformConfig({
    enabled: platform === null,
    staleTime: 60_000,
  })

  return platform ?? data ?? null
}
