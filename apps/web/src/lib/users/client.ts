'use client'

import { apiFetch, errorHandling, getResponseMetadata } from '@/lib/api-client'
import type { CustomResponseTyping } from '@/lib/api-client'
import { getQueryClient } from '@/lib/react-query/queryClient'
import { queryKeys } from '@/lib/react-query/queryKeys'
import type { components } from '@/lib/api/generated'

type UserRead = components['schemas']['UserRead']
type CourseRead = components['schemas']['CourseRead']

type ResponseMetadata<T> = Omit<CustomResponseTyping, 'data'> & {
  data: T | null
}

export const userKeys = {
  byId: (userId: number) => queryKeys.users.byId(userId),
  byUsername: (username: string) => queryKeys.users.byUsername(username),
  coursesByUser: (userId: number) => queryKeys.users.courses(userId),
}

export async function getUserById(userId: number): Promise<UserRead> {
  const response = await apiFetch(`users/id/${userId}`)
  return errorHandling<UserRead>(response)
}

export async function getUserByUsername(username: string): Promise<UserRead> {
  const response = await apiFetch(`users/username/${encodeURIComponent(username)}`)
  return errorHandling<UserRead>(response)
}

export async function getCurrentUserProfile(): Promise<UserRead> {
  const response = await apiFetch('users/profile')
  return errorHandling<UserRead>(response)
}

export async function getCoursesByUser(userId: number): Promise<ResponseMetadata<CourseRead[]>> {
  const response = await apiFetch(`users/${userId}/courses`)
  return getResponseMetadata(response)
}

export async function updateUserAvatar(userId: number, avatarFile: File): Promise<ResponseMetadata<UserRead>> {
  const formData = new FormData()
  formData.append('avatar_file', avatarFile)

  const response = await apiFetch(`users/update_avatar/${userId}`, {
    method: 'PUT',
    body: formData,
  })
  const meta = await getResponseMetadata(response)
  const data = meta.data as UserRead | null

  if (response.ok) {
    await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })
    if (data?.username) {
      await getQueryClient().invalidateQueries({
        queryKey: userKeys.byUsername(data.username),
      })
    }
  }

  return {
    success: response.ok,
    data,
    status: response.status,
    HTTPmessage: response.statusText,
  }
}

export async function updateUserTheme(userId: number, theme: string): Promise<void> {
  const response = await apiFetch(`users/preferences/theme/${userId}?theme=${encodeURIComponent(theme)}`, {
    method: 'PUT',
  })
  await errorHandling(response)
  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })
}

export async function updateUserLocale(userId: number, locale: string): Promise<UserRead> {
  const response = await apiFetch(`users/preferences/locale/${userId}?locale=${encodeURIComponent(locale)}`, {
    method: 'PUT',
  })
  const data = await errorHandling<UserRead>(response)

  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })

  return data
}

export async function updateProfile(data: unknown, userId: number): Promise<ResponseMetadata<UserRead>> {
  const response = await apiFetch(`users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const meta = await getResponseMetadata(response)
  const payload = meta.data as UserRead | null

  if (response.ok) {
    await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })
  }

  return {
    success: response.ok,
    data: payload,
    status: response.status,
    HTTPmessage: response.statusText,
  }
}

export async function updatePassword(userId: number, data: unknown): Promise<ResponseMetadata<unknown>> {
  const response = await apiFetch(`users/change_password/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const meta = await getResponseMetadata(response)

  return {
    success: response.ok,
    data: meta.data,
    status: response.status,
    HTTPmessage: response.statusText,
  }
}

export {
  useUserByIdQuery as useUserById,
  useUserByUsernameQuery as useUserByUsername,
} from '@/features/users/hooks/useUsers'
