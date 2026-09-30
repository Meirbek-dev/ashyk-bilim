'use client'

import { apiJson, apiResult } from '@/lib/api-client'
import { ifMatchHeaders, parseEntityTagVersion } from '@/lib/api/headers'
import { getQueryClient } from '@/lib/react-query/queryClient'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { UserProfile } from '@/lib/api/generated/zod'
import type {
  AdminUser,
  CoursePage,
  ProfileSections,
  PublicProfile,
  UpdateProfileRequest,
  UserProfile as UserProfileType,
} from '@/lib/api/generated/zod'
import { uploadFile } from '@/services/media/uploads'
import { collectPages } from '@/lib/api/contract'
import { toAppCourse } from '@/hooks/courses/courseKeys'

/**
 * Self-service profile calls (`/users/me`, v2). Other users are reachable
 * through their public card (`GET /users/{username}`, `GET /users/by-id/{id}`),
 * admin listings (`GET /users`) and summaries embedded in course payloads.
 */

export const userKeys = {
  me: () => queryKeys.users.me(),
  byId: (userId: string) => queryKeys.users.byId(userId),
  byUsername: (username: string) => queryKeys.users.byUsername(username),
  coursesByUser: (username: string) => ['users', 'courses', username] as const,
}

export interface PublicUser {
  avatar_image?: string | null | undefined
  avatar_key?: string | null | undefined
  bio: string
  details: Record<string, { icon: string; id: string; label: string; text: string }>
  display_name: string
  email?: string
  first_name: string
  id: string
  last_name: string
  middle_name?: string
  profile: ProfileSections
  roles?: string[]
  username: string
}

function toPublicUser(user: PublicProfile | AdminUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    first_name: user.display_name,
    last_name: '',
    bio: 'bio' in user ? user.bio : '',
    details: {},
    profile: 'profile' in user ? user.profile : { sections: [] },
    ...('email' in user ? { email: user.email, roles: user.roles } : {}),
    ...('avatar_key' in user ? { avatar_key: user.avatar_key, avatar_image: user.avatar_key } : {}),
  }
}

/** `GET /users/{username}`: the public card (404 → rejects like any API error). */
export async function getUserByUsername(username: string): Promise<PublicUser> {
  return toPublicUser(await apiJson<PublicProfile>(`users/${encodeURIComponent(username)}`))
}

/** `GET /users/by-id/{id}`: the same public card, by id (editor user blocks store the id). */
export async function getUserById(userId: string): Promise<PublicUser> {
  return toPublicUser(await apiJson<PublicProfile>(`users/by-id/${encodeURIComponent(userId)}`))
}

/** `GET /users/{username}/courses`: authored + actively co-authored courses (public ones for strangers), last updated first. */
export async function getCoursesByUser(username: string): Promise<AppCourse[]> {
  const courses = await collectPages(cursor =>
    apiJson<CoursePage>(`users/${encodeURIComponent(username)}/courses?limit=100${cursor ? `&cursor=${cursor}` : ''}`),
  )
  // UX-234: the cards show the update date, so list by it — as /courses does
  // (the API pages this list by id, i.e. creation).
  return courses.toSorted((a, b) => b.updated_at_unix - a.updated_at_unix).map(toAppCourse)
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

/**
 * Save the profile builder document under `If-Match: "<version>"` (BUG-367):
 * a save from a stale tab is 412 `precondition-failed`, never a silent
 * overwrite. Resolves to the new version (`ETag`).
 */
export async function saveProfileDocument(profile: ProfileSections, version: number | null): Promise<number | null> {
  const { headers } = await apiResult(
    'users/me',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...ifMatchHeaders(version) },
      body: JSON.stringify({ profile }),
    },
    result => UserProfile.parse(result),
  )
  await invalidateMe()
  return parseEntityTagVersion(headers)
}

/** Upload a new avatar through the presigned pipeline and claim it on the profile. */
export async function updateUserAvatar(avatarFile: File): Promise<UserProfileType> {
  const upload = await uploadFile(avatarFile, 'avatar')
  return updateProfile({ avatar_upload_id: upload.id })
}

/** Remove the avatar (UX-163); the server releases the upload. */
export async function removeUserAvatar(): Promise<UserProfileType> {
  return updateProfile({ avatar_upload_id: null })
}

export async function updateUserLocale(locale: string): Promise<UserProfileType> {
  return updateProfile({ locale })
}
