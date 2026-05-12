'use client';

import { environmentManager, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const FIVE_MINUTES = 5 * 60 * 1000;

function shouldRetry(failureCount: number, error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;

  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return false;
  }

  return failureCount < 3;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: FIVE_MINUTES,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        retryDelay: 5000,
        staleTime: 60_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) {
    return makeQueryClient();
  }

  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

/**
 * SessionStorage persister for the query cache.
 * Uses sessionStorage so data is cleared when the browser tab closes,
 * avoiding stale data across different user sessions on shared devices.
 * Only created in the browser — returns null on the server.
 */
export function createQueryPersister() {
  if (typeof window === 'undefined') return null;
  return createAsyncStoragePersister({
    storage: window.sessionStorage,
    key: 'tanstack-query-cache',
  });
}
