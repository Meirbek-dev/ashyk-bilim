'use client';

import type { UserSessionResponse } from '@/lib/auth/types';
import { updateUserTheme } from '@/lib/users/client';
import { mutationOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

export function syncUserThemeMutationOptions(queryClient: QueryClient, userId: number) {
  return mutationOptions<void, Error, string>({
    mutationFn: (theme: string) => updateUserTheme(userId, theme),
    onSuccess: async (_data, theme) => {
      queryClient.setQueryData<UserSessionResponse | undefined>(['auth', 'me', userId], (current) => {
        if (!current) return current;

        return {
          ...current,
          user: {
            ...current.user,
            theme,
          },
        };
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.users.byId(userId) });
    },
  });
}
