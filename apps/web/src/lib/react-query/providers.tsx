'use client'

import { IS_DEVELOPMENT } from '@/services/config/env'
import { QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryPersister, getQueryClient, shouldPersistQuery } from './queryClient'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface ReactQueryProviderProps {
  children: ReactNode
}

const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000
const ReactQueryDevtools = IS_DEVELOPMENT
  ? dynamic(() => import('@tanstack/react-query-devtools').then(mod => mod.ReactQueryDevtools), {
      ssr: false,
    })
  : null

export function ReactQueryProvider({ children }: ReactQueryProviderProps) {
  const [queryClient] = useState(() => getQueryClient())
  // Persister is created once on the client; null on the server (SSR).
  const persister = useMemo(() => createQueryPersister(), [])

  const inner = (
    <>
      {children}
      {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </>
  )

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: '1',
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
        },
      }}
    >
      {inner}
    </PersistQueryClientProvider>
  )
}
