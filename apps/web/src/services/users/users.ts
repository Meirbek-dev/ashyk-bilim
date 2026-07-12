'use server'
import { apiJson, apiResult } from '@/lib/api-client'
import { tags } from '@/lib/cacheTags'

export interface AppUserProfileDetail {
  icon: string
  id?: number | string
  text: string
}

export interface AppUserProfileData extends AppUserSummary {
  bio?: string | null
  details?: Record<string, AppUserProfileDetail>
  id: number
  profile?: string | Record<string, unknown> | null
  user_uuid: string
}

export async function getUser(user_id: number): Promise<AppUserProfileData> {
  return apiJson<AppUserProfileData>(`users/id/${user_id}`)
}

export async function getUserByUsername(username: string): Promise<AppUserProfileData> {
  return apiJson<AppUserProfileData>(`users/username/${username}`)
}

export async function getCoursesByUser(user_id: number) {
  return apiResult<AppCourse[]>(`users/${user_id}/courses`)
}

export async function updateUserAvatar(user_id: number, avatar_file: File) {
  const formData = new FormData()
  formData.append('avatar_file', avatar_file)
  const data = await apiJson<AppUserProfileData>(`users/update_avatar/${user_id}`, {
    method: 'PUT',
    body: formData,
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.users, 'max')

  return data
}

export async function updateUserTheme(user_id: number, theme: string) {
  const data = await apiJson<AppPayload>(`users/preferences/theme/${user_id}?theme=${encodeURIComponent(theme)}`, {
    method: 'PUT',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.users, 'max')

  return data
}

export async function updateUserLocale(user_id: number, locale: string) {
  const data = await apiJson<AppPayload>(`users/preferences/locale/${user_id}?locale=${encodeURIComponent(locale)}`, {
    method: 'PUT',
  })

  const { revalidateTag } = await import('next/cache')
  revalidateTag(tags.users, 'max')

  return data
}
