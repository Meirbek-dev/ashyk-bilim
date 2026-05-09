'use client';

import { apiFetch } from '@/lib/api-client';
import { getQueryClient } from '@/lib/react-query/queryClient';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { CustomResponseTyping } from '@/lib/api-client';
import type { components } from '@/lib/api/generated';

type UserRead = components['schemas']['UserRead'];
type CourseRead = components['schemas']['CourseRead'];

type ResponseMetadata<T> = Omit<CustomResponseTyping, 'data'> & {
  data: T | null;
};

export const userKeys = {
  byId: (userId: number) => queryKeys.users.byId(userId),
  byUsername: (username: string) => queryKeys.users.byUsername(username),
  coursesByUser: (userId: number) => queryKeys.users.courses(userId),
};

async function parseJsonOrNull<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function requireOkJson<T>(response: Response): Promise<T> {
  const data = await parseJsonOrNull<T | { detail?: string }>(response);

  if (!response.ok) {
    const error: Error & { status?: number; data?: unknown } = new Error(
      typeof data === 'object' && data && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : response.statusText || 'Request failed',
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export async function getUserById(userId: number): Promise<UserRead> {
  const response = await apiFetch(`users/id/${userId}`);
  return requireOkJson<UserRead>(response);
}

export async function getUserByUsername(username: string): Promise<UserRead> {
  const response = await apiFetch(`users/username/${encodeURIComponent(username)}`);
  return requireOkJson<UserRead>(response);
}

export async function getCurrentUserProfile(): Promise<UserRead> {
  const response = await apiFetch('users/profile');
  return requireOkJson<UserRead>(response);
}

export async function getCoursesByUser(userId: number): Promise<ResponseMetadata<CourseRead[]>> {
  const response = await apiFetch(`users/${userId}/courses`);
  const data = await parseJsonOrNull<CourseRead[]>(response);

  return {
    success: response.status === 200,
    data,
    status: response.status,
    HTTPmessage: response.statusText,
  };
}

export async function updateUserAvatar(userId: number, avatarFile: File): Promise<ResponseMetadata<UserRead>> {
  const formData = new FormData();
  formData.append('avatar_file', avatarFile);

  const response = await apiFetch(`users/update_avatar/${userId}`, {
    method: 'PUT',
    body: formData,
  });
  const data = await parseJsonOrNull<UserRead>(response);

  if (response.ok) {
    await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) });
  }

  return {
    success: response.status === 200,
    data,
    status: response.status,
    HTTPmessage: response.statusText,
  };
}

export async function updateUserTheme(userId: number, theme: string): Promise<void> {
  const response = await fetch('/api/user/theme', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  });

  await requireOkJson<unknown>(response);
  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) });
}

export async function updateUserLocale(userId: number, locale: string): Promise<UserRead> {
  const response = await apiFetch(`users/preferences/locale/${userId}?locale=${encodeURIComponent(locale)}`, {
    method: 'PUT',
  });
  const data = await requireOkJson<UserRead>(response);

  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) });

  return data;
}

export async function updateProfile(data: unknown, userId: number): Promise<ResponseMetadata<UserRead>> {
  const response = await apiFetch(`users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const payload = await parseJsonOrNull<UserRead>(response);

  if (response.ok) {
    await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) });
  }

  return {
    success: response.status === 200,
    data: payload,
    status: response.status,
    HTTPmessage: response.statusText,
  };
}

export async function updatePassword(userId: number, data: unknown): Promise<ResponseMetadata<unknown>> {
  const response = await apiFetch(`users/change_password/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const payload = await parseJsonOrNull<unknown>(response);

  return {
    success: response.status === 200,
    data: payload,
    status: response.status,
    HTTPmessage: response.statusText,
  };
}

export {
  useUserByIdQuery as useUserById,
  useUserByUsernameQuery as useUserByUsername,
} from '@/features/users/hooks/useUsers';
