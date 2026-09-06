'use client'

import { apiJson } from '@/lib/api-client'
import { getQueryClient } from '@/lib/react-query/queryClient'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { UserProfile } from '@/lib/api/generated/zod'
import type { UpdateProfileRequest, UserProfile as UserProfileType } from '@/lib/api/generated/zod'
import { uploadFile } from '@/services/media/uploads'

/**
 * Self-service profile calls (`/users/me`, v2). Other users are only
 * reachable through admin listings (`GET /users`) and public summaries
 * embedded in course/discussion payloads — there is no `GET /users/{id}`.
 */

export const userKeys = {
  me: () => queryKeys.users.me(),
}

export async function getCurrentUserProfile(): Promise<UserProfileType> {
  return apiJson('users/me', {}, data => UserProfile.parse(data))
}

async function invalidateMe(): Promise<void> {
  await getQueryClient().invalidateQueries({ queryKey: userKeys.me() })
}

export async function updateProfile(data: UpdateProfileRequest): Promise<UserProfileType> {
  const payload = await apiJson(
    'users/me',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    result => UserProfile.parse(result),
  )
  await invalidateMe()
  return payload
}

/** Upload a new avatar through the presigned pipeline and claim it on the profile. */
export async function updateUserAvatar(avatarFile: File): Promise<UserProfileType> {
  const upload = await uploadFile(avatarFile, 'avatar')
  return updateProfile({ avatar_upload_id: upload.id })
}

export async function updateUserLocale(locale: string): Promise<UserProfileType> {
  return updateProfile({ locale })
}
