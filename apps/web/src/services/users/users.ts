'use server'
import { apiJson } from '@/lib/api-client'
import { isApiError } from '@/lib/api/assertSuccess'
import type { AdminUserPage, UserHit } from '@/lib/api/generated/zod'

/**
 * Public profile projection (server side). v2 has no `GET /users/{id}`:
 * other users are reachable through `GET /users/{username}` (public card,
 * readable anonymously) or the admin listing `GET /users`. `first_name`/`last_name`/`bio`/`profile` are
 * kept for the profile page which still renders the legacy shape.
 */
export interface AppUserProfileData {
  avatar_key: string | null
  bio: string
  details: Record<string, { icon: string; id: string; text: string }>
  display_name: string
  first_name: string
  id: string
  last_name: string
  profile: Record<string, unknown>
  username: string
}

function toProfile(user: UserHit | AdminUserPage['items'][number]): AppUserProfileData {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    first_name: user.display_name,
    last_name: '',
    bio: '',
    details: {},
    profile: {},
    avatar_key: 'avatar_key' in user ? (user.avatar_key ?? null) : null,
  }
}

export async function getUser(user_id: string): Promise<AppUserProfileData> {
  const page = await apiJson<AdminUserPage>(`users?q=${encodeURIComponent(user_id)}&limit=20`)
  const user = page.items.find(candidate => candidate.id === user_id)
  if (!user) throw new Error(`User ${user_id} was not found`)
  return toProfile(user)
}

/** `null` when no user has that username (a page state, not a load failure). */
export async function getUserByUsername(username: string): Promise<AppUserProfileData | null> {
  try {
    return toProfile(await apiJson<UserHit>(`users/${encodeURIComponent(username)}`))
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null
    throw error
  }
}

