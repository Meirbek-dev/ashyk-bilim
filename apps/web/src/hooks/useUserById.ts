'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { userByIdQueryOptions } from '@/features/users/queries/users.query';

function userByIdHookOptions(userId: number | null) {
  return queryOptions({
    ...userByIdQueryOptions(userId ?? 0),
    enabled: userId !== null,
  });
}

export function useUserById(userId: number | string | undefined) {
  const normalizedUserId = userId === undefined || userId === null ? null : Number(userId);

  return useQuery(userByIdHookOptions(normalizedUserId));
}
