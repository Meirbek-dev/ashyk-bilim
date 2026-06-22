import type { ClassValue } from 'cnfast'
import { clsx, twMerge } from 'cnfast'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a UUID. Uses the Web Crypto API (available in all modern browsers
 * and Node.js 14.17+). Falls back to a simple time-based id for ancient envs.
 */
export function generateUUID(): string {
  if (typeof globalThis.window !== 'undefined' && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Minimal fallback (RFC 4122 v4 shape) — no external dependency needed.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16)
    const value = c === 'x' ? r : (r % 4) + 8
    return value.toString(16)
  })
}

const YOUTUBE_VIDEO_ID_LENGTH = 11

export const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null

  const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?]{11})/i
  const match = youtubeRegex.exec(url)

  return match?.[1]?.length === YOUTUBE_VIDEO_ID_LENGTH ? match[1] : null
}
