import { APP_THUMBNAIL_IMAGE_PATH } from '@/lib/constants'
import { getPublicConfig } from '@services/config/env'

/**
 * Public media resolution for the v2 storage layout.
 *
 * Every public object is addressed by its storage `key` (`Platform.logo_key`,
 * `UserProfile.avatar_key`, course `thumbnail_key`, block `file_key`, …) and
 * served anonymously at `/content/<key>` (nginx → the `ab-public` bucket,
 * immutable cache; DECISIONS "Same-origin object storage routing").
 */

const getMediaUrl = () => getPublicConfig().mediaUrl

export const EMPTY_COURSE_THUMBNAIL_PATH = '/empty_thumbnail.avif'

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '')

/** Absolute URL for a public storage key; `null`/empty keys yield `null`. */
export function getContentUrl(key: string | null | undefined): string | null {
  const normalized = key?.trim()
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('blob:') || normalized.startsWith('data:')) {
    return normalized
  }
  return `${getMediaUrl()}content/${trimSlashes(normalized)}`
}

export function getCourseThumbnailUrl(thumbnailKey?: string | null): string {
  return getContentUrl(thumbnailKey) ?? EMPTY_COURSE_THUMBNAIL_PATH
}

/** @deprecated legacy signature kept for call sites not yet on keys — resolves the key only. */
export function getCourseThumbnailMediaDirectory(_courseId?: string | null, thumbnailKey?: string | null): string {
  return getCourseThumbnailUrl(thumbnailKey)
}

/** @deprecated v2 avatar values are complete storage keys; the user id is ignored. */
export function getUserAvatarMediaDirectory(_userId: string, avatarKey: string): string {
  return getContentUrl(avatarKey) ?? ''
}

export interface ActivityBlockMediaDirectoryParams {
  courseId: string
  activityId: string
  blockId: string
  fileId: string
  type: string
}

/** @deprecated v2 block file values are complete storage keys. */
export function getActivityBlockMediaDirectory({ fileId }: ActivityBlockMediaDirectoryParams): string {
  return getContentUrl(fileId) ?? ''
}

export interface ActivityMediaDirectoryParams {
  courseUUID: string
  activityUUID: string
  fileId: string
  activityType: string
}

/** @deprecated v2 activity file values are complete storage keys. */
export function getActivityMediaDirectory({ fileId }: ActivityMediaDirectoryParams): string | undefined {
  return getContentUrl(fileId) ?? undefined
}

export function getPlatformLogoUrl(logoKey?: string | null): string | null {
  return getContentUrl(logoKey)
}

export function getPlatformThumbnailImage(thumbnailKey?: string | null): string {
  const resolved = getContentUrl(thumbnailKey)
  if (resolved) return resolved

  const thumbnailPath = APP_THUMBNAIL_IMAGE_PATH.startsWith('/')
    ? APP_THUMBNAIL_IMAGE_PATH.slice(1)
    : APP_THUMBNAIL_IMAGE_PATH

  return `${getPublicConfig().siteUrl}${thumbnailPath}`
}

/** @deprecated use `getPlatformLogoUrl(logo_key)`. */
export function getLogoMediaDirectory(logoKey: string): string {
  return getContentUrl(logoKey) ?? ''
}

/** @deprecated use `getPlatformThumbnailImage(thumbnail_key)`. */
export function getThumbnailMediaDirectory(thumbnailKey: string): string {
  return getContentUrl(thumbnailKey) ?? ''
}
