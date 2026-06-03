'use server'
import { apiFetch, errorHandling, getResponseMetadata } from '@/lib/api-client'
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
  const result = await apiFetch(`users/id/${user_id}`)
  return await errorHandling<AppUserProfileData>(result)
}

export async function getUserByUsername(username: string): Promise<AppUserProfileData> {
  const result = await apiFetch(`users/username/${username}`)
  return await errorHandling<AppUserProfileData>(result)
}

export async function getCoursesByUser(user_id: number) {
  const result = await apiFetch(`users/${user_id}/courses`)
  return await getResponseMetadata<AppCourse[]>(result)
}

export async function updateUserAvatar(user_id: number, avatar_file: File) {
  const formData = new FormData()
  formData.append('avatar_file', avatar_file)
  const result = await apiFetch(`users/update_avatar/${user_id}`, {
    method: 'PUT',
    body: formData,
  })
  const metadata = await getResponseMetadata<AppUserProfileData>(result)

  if (metadata.success) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.users, 'max')
  }

  return metadata
}

export async function updateUserTheme(user_id: number, theme: string) {
  const result = await apiFetch(`users/preferences/theme/${user_id}?theme=${encodeURIComponent(theme)}`, {
    method: 'PUT',
  })
  const data = await errorHandling<AppPayload>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.users, 'max')
  }

  return data
}

export async function updateUserLocale(user_id: number, locale: string) {
  const result = await apiFetch(`users/preferences/locale/${user_id}?locale=${encodeURIComponent(locale)}`, {
    method: 'PUT',
  })
  const data = await errorHandling<AppPayload>(result)

  if (result.ok) {
    const { revalidateTag } = await import('next/cache')
    revalidateTag(tags.users, 'max')
  }

  return data
}
