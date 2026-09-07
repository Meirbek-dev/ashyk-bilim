'use client'

import { apiJson } from '@/lib/api-client'
import { getQueryClient } from '@/lib/react-query/queryClient'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { UserProfile } from '@/lib/api/generated/zod'
import type {
  AdminUser,
  AdminUserPage,
  CoursePage,
  SearchResults,
  UpdateProfileRequest,
  UserProfile as UserProfileType,
} from '@/lib/api/generated/zod'
import { uploadFile } from '@/services/media/uploads'

/**
 * Self-service profile calls (`/users/me`, v2). Other users are only
 * reachable through admin listings (`GET /users`) and public summaries
 * embedded in course/discussion payloads — there is no `GET /users/{id}`.
 */

export const userKeys = {
  me: () => queryKeys.users.me(),
  byId: (userId: string) => queryKeys.users.byId(userId),
  byUsername: (username: string) => queryKeys.users.byUsername(username),
  coursesByUser: (userId: string) => ['users', 'courses', userId] as const,
}

export interface PublicUser {
  avatar_image?: string | null
  avatar_key?: string | null
  bio: string
  details: Record<string, { icon: string; id: string; label: string; text: string }>
  display_name: string
  email?: string
  first_name: string
  id: string
  last_name: string
  profile: Record<string, unknown>
  roles?: string[]
  username: string
}

function toPublicUser(user: SearchResults['users'][number] | AdminUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    first_name: user.display_name,
    last_name: '',
    bio: '',
    details: {},
    profile: {},
    ...('email' in user ? { email: user.email, roles: user.roles } : {}),
    ...('avatar_key' in user ? { avatar_key: user.avatar_key, avatar_image: user.avatar_key } : {}),
  }
}

export async function getUserByUsername(username: string): Promise<PublicUser> {
  const results = await apiJson<SearchResults>(`search?q=${encodeURIComponent(username)}&limit=20`)
  const user = results.users.find(candidate => candidate.username.toLowerCase() === username.toLowerCase())
  if (!user) throw new Error(`User ${username} was not found`)
  return toPublicUser(user)
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const page = await apiJson<AdminUserPage>(`users?q=${encodeURIComponent(userId)}&limit=20`)
  const user = page.items.find(candidate => candidate.id === userId)
  if (!user) throw new Error(`User ${userId} was not found`)
  return toPublicUser(user)
}

export async function getCoursesByUser(userId: string): Promise<AppCourse[]> {
  const page = await apiJson<CoursePage>('courses?limit=100')
  return page.items
    .filter(course => course.creator_id === userId)
    .map(course => ({
      ...course,
      course_uuid: course.id,
      creation_date: new Date(course.created_at_unix * 1000).toISOString(),
      update_date: new Date(course.updated_at_unix * 1000).toISOString(),
    }))
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
