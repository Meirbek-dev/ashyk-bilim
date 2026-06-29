import { getPublicConfig } from '@services/config/env'

const GOOGLE_AVATAR_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
])

const AVATAR_CONTENT_PREFIX = 'content/users/'

export const DEFAULT_AVATAR_PATH = '/empty_avatar.avif'
export const AI_AVATAR_PATH = '/app_logo_light.svg'

export interface AvatarUser {
  avatar_image?: string | null
  user_uuid?: string | null
  username?: string | null
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
}

export type PredefinedAvatar = 'ai' | 'empty'

export const isExternalUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://')

const isBrowserPreviewUrl = (url: string) => url.startsWith('blob:') || url.startsWith('data:image/')

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '')

const joinUrl = (baseUrl: string, path: string) => {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${path.replace(/^\/+/, '')}`
}

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const extractExternalAvatarUrl = (url: string): string | null => {
  const marker = '/avatars/'
  const markerIndex = url.indexOf(marker)
  if (markerIndex === -1) return null

  const embeddedUrl = safeDecodeURIComponent(url.slice(markerIndex + marker.length))
  return isExternalUrl(embeddedUrl) ? embeddedUrl : null
}

export const isGoogleAvatarUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'https:' && GOOGLE_AVATAR_HOSTS.has(parsedUrl.hostname.toLowerCase())
  } catch {
    return false
  }
}

export const getProxiedAvatarUrl = (url: string): string => `/api/avatar?url=${encodeURIComponent(url)}`

export const normalizeAvatarUrl = (url: string): string => {
  const externalUrl = extractExternalAvatarUrl(url) ?? (isExternalUrl(url) ? url : null)
  if (!externalUrl) return url

  return isGoogleAvatarUrl(externalUrl) ? getProxiedAvatarUrl(externalUrl) : externalUrl
}

export function getAvatarInitials(user?: AvatarUser | null, fallbackText?: string): string {
  const explicitFallback = fallbackText?.trim()
  if (explicitFallback) return explicitFallback.slice(0, 2).toUpperCase()

  const firstInitial = user?.first_name?.trim().charAt(0) ?? ''
  const lastInitial = user?.last_name?.trim().charAt(0) ?? ''
  const fullNameInitials = `${firstInitial}${lastInitial}`.trim()
  if (fullNameInitials) return fullNameInitials.toUpperCase()

  const usernameInitial = user?.username?.trim().charAt(0)
  return usernameInitial ? usernameInitial.toUpperCase() : '?'
}

export function resolveAvatarUrl({
  avatarUrl,
  predefinedAvatar,
  user,
}: {
  avatarUrl?: string | null
  predefinedAvatar?: PredefinedAvatar | null
  user?: AvatarUser | null
}): string {
  if (predefinedAvatar === 'ai') return AI_AVATAR_PATH
  if (predefinedAvatar === 'empty') return DEFAULT_AVATAR_PATH

  const rawUrl = (avatarUrl ?? user?.avatar_image ?? '').trim()
  if (!rawUrl) return DEFAULT_AVATAR_PATH
  if (isBrowserPreviewUrl(rawUrl)) return rawUrl

  const normalizedUrl = normalizeAvatarUrl(rawUrl)
  if (normalizedUrl !== rawUrl || normalizedUrl.startsWith('/api/avatar') || isExternalUrl(normalizedUrl)) {
    return normalizedUrl
  }

  const path = trimSlashes(rawUrl)
  if (path.startsWith(AVATAR_CONTENT_PREFIX)) {
    return joinUrl(getPublicConfig().mediaUrl, path)
  }

  if (rawUrl.startsWith('/')) return rawUrl

  if (user?.user_uuid && !path.includes('/')) {
    return joinUrl(getPublicConfig().mediaUrl, `content/users/${user.user_uuid}/avatars/${path}`)
  }

  return `/${rawUrl}`
}
