'use client'

import { apiJson } from '@/lib/api-client'
import { getQueryClient } from '@/lib/react-query/queryClient'
import { queryKeys } from '@/lib/react-query/queryKeys'
import type * as schemas from '@/lib/api/generated/api.schemas'

type UserRead = schemas.UserRead
type CourseRead = schemas.CourseRead

export const userKeys = {
  byId: (userId: number) => queryKeys.users.byId(userId),
  byUsername: (username: string) => queryKeys.users.byUsername(username),
  coursesByUser: (userId: number) => queryKeys.users.courses(userId),
}

export async function getUserById(userId: number): Promise<UserRead> {
  return apiJson<UserRead>(`users/id/${userId}`)
}

export async function getUserByUsername(username: string): Promise<UserRead> {
  return apiJson<UserRead>(`users/username/${encodeURIComponent(username)}`)
}

export async function getCurrentUserProfile(): Promise<UserRead> {
  return apiJson<UserRead>('users/profile')
}

export async function getCoursesByUser(userId: number): Promise<CourseRead[]> {
  return apiJson<CourseRead[]>(`users/${userId}/courses`)
}

export async function updateUserAvatar(userId: number, avatarFile: File): Promise<UserRead> {
  const formData = new FormData()
  formData.append('avatar_file', avatarFile)

  const data = await apiJson<UserRead>(`users/update_avatar/${userId}`, {
    method: 'PUT',
    body: formData,
  })

  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })
  if (data.username) {
    await getQueryClient().invalidateQueries({
      queryKey: userKeys.byUsername(data.username),
    })
  }

  return data
}

export async function updateUserTheme(userId: number, theme: string): Promise<void> {
  await apiJson(`users/preferences/theme/${userId}?theme=${encodeURIComponent(theme)}`, {
    method: 'PUT',
  })

  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })
}

export async function updateUserLocale(userId: number, locale: string): Promise<UserRead> {
  const data = await apiJson<UserRead>(`users/preferences/locale/${userId}?locale=${encodeURIComponent(locale)}`, {
    method: 'PUT',
  })

  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })

  return data
}

export async function updateProfile(data: unknown, userId: number): Promise<UserRead> {
  const payload = await apiJson<UserRead>(`users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  await getQueryClient().invalidateQueries({ queryKey: userKeys.byId(userId) })

  return payload
}

export async function updatePassword(userId: number, data: unknown): Promise<unknown> {
  return apiJson(`users/change_password/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
