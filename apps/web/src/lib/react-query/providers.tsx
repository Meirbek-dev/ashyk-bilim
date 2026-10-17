'use client'

import { IS_DEVELOPMENT } from '@/services/config/env'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from './queryClient'
import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

interface ReactQueryProviderProps {
  children: ReactNode
}

const ReactQueryDevtools = IS_DEVELOPMENT
  ? dynamic(() => import('@tanstack/react-query-devtools').then(mod => mod.ReactQueryDevtools), {
      ssr: false,
    })
  : null

export function ReactQueryProvider({ children }: ReactQueryProviderProps) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}
