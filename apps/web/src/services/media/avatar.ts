import { getContentUrl } from './media'

const GOOGLE_AVATAR_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
])

export const DEFAULT_AVATAR_PATH = '/empty_avatar.avif'
export const AI_AVATAR_PATH = '/app_logo_light.svg'

/**
 * The minimal user shape every avatar renderer accepts: the v2 `UserProfile`
 * / `UserSummary` / discussion author summary all carry `avatar_key` (a
 * public storage key) and `display_name`.
 */
export interface AvatarUser {
  avatar_key?: string | null | undefined
  username?: string | null | undefined
  display_name?: string | null | undefined
}

export type PredefinedAvatar = 'ai' | 'empty'

export const isExternalUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://')

const isBrowserPreviewUrl = (url: string) => url.startsWith('blob:') || url.startsWith('data:image/')

export const isGoogleAvatarUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'https:' && GOOGLE_AVATAR_HOSTS.has(parsedUrl.hostname.toLowerCase())
  } catch {
    return false
  }
}

export const getProxiedAvatarUrl = (url: string): string => `/api/avatar?url=${encodeURIComponent(url)}`

/** External avatar URLs from Google are proxied through the app (referrer/CORS safe). */
export const normalizeAvatarUrl = (url: string): string => {
  if (!isExternalUrl(url)) return url
  return isGoogleAvatarUrl(url) ? getProxiedAvatarUrl(url) : url
}

/** The name to show for a user: `display_name`, else the username. */
export function getUserDisplayName(user?: AvatarUser | null, fallback = ''): string {
  const displayName = user?.display_name?.trim()
  if (displayName) return displayName
  const username = user?.username?.trim()
  return username || fallback
}

export function getAvatarInitials(user?: AvatarUser | null, fallbackText?: string): string {
  const explicitFallback = fallbackText?.trim()
  if (explicitFallback) return explicitFallback.slice(0, 2).toUpperCase()

  const displayName = user?.display_name?.trim()
  if (displayName) {
    const parts = displayName.split(/\s+/u).filter(Boolean)
    const initials = parts
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join('')
    if (initials) return initials.toUpperCase()
  }

  const usernameInitial = user?.username?.trim().charAt(0)
  return usernameInitial ? usernameInitial.toUpperCase() : '?'
}

export function resolveAvatarUrl({
  avatarUrl,
  predefinedAvatar,
  user,
}: {
  /** An explicit URL / storage key / browser preview (`blob:`) to prefer over the user's key. */
  avatarUrl?: string | null
  predefinedAvatar?: PredefinedAvatar | null
  user?: AvatarUser | null
}): string {
  if (predefinedAvatar === 'ai') return AI_AVATAR_PATH
  if (predefinedAvatar === 'empty') return DEFAULT_AVATAR_PATH

  const rawUrl = (avatarUrl ?? user?.avatar_key ?? '').trim()
  if (!rawUrl) return DEFAULT_AVATAR_PATH
  if (isBrowserPreviewUrl(rawUrl)) return rawUrl
  if (isExternalUrl(rawUrl)) return normalizeAvatarUrl(rawUrl)
  if (rawUrl.startsWith('/')) return rawUrl

  return getContentUrl(rawUrl) ?? DEFAULT_AVATAR_PATH
}
