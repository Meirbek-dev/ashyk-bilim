'use client';

import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getQueryClient } from './queryClient';
import { useState } from 'react';
import type { ReactNode } from 'react';

interface ReactQueryProviderProps {
  children: ReactNode;
  dehydratedState?: DehydratedState;
}

export function ReactQueryProvider({ children, dehydratedState }: ReactQueryProviderProps) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
