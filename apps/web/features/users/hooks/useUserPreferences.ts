'use client';

import { mutationOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { syncUserThemeMutationOptions } from '../mutations/user-preferences.mutation';

function disabledSyncUserThemeMutationOptions() {
  return mutationOptions<void, Error, string>({
    mutationFn: async (_theme: string): Promise<void> => {
      throw new Error('Cannot sync theme without an authenticated user');
    },
  });
}

export function useSyncUserTheme(userId: number | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation(
    userId ? syncUserThemeMutationOptions(queryClient, userId) : disabledSyncUserThemeMutationOptions(),
  );
}
