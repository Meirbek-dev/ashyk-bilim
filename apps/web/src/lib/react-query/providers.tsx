'use client';

import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createQueryPersister, getQueryClient } from './queryClient';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface ReactQueryProviderProps {
  children: ReactNode;
  dehydratedState?: DehydratedState;
}

const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

export function ReactQueryProvider({ children, dehydratedState }: ReactQueryProviderProps) {
  const [queryClient] = useState(() => getQueryClient());
  // Persister is created once on the client; null on the server (SSR).
  const persister = useMemo(() => createQueryPersister(), []);

  const inner = (
    <>
      <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </>
  );

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: '1',
      }}
    >
      {inner}
    </PersistQueryClientProvider>
  );
}
