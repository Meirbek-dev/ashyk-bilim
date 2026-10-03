import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { locales, type Locale } from '#/paraglide/runtime'
import { ApiError } from '#/shared/api/errors'
import { checkUpload } from '#/shared/api/upload'
import { MODES } from '#/shared/lib/appearance'
import type { Locale as ProfileLocale, Profile, SessionSummary } from '#/shared/api/gen/types.gen'
import { vNotificationPreferences, vPrivacyPreferences } from '#/shared/api/gen/valibot.gen'

/** Public storage keys (`avatar_key`...) are served anonymously at /content/<key>. */
export const contentUrl = (key: string) => `/content/${key}`

const MB = 1024 * 1024
export const AVATAR_MAX_MB = 5

/** Why a picked photo is refused before any request (the server's `avatar` policy), or null. */
export function avatarProblem(file: { size: number; type: string }): string | null {
  const problem = checkUpload(file, 'avatar')
  if (!problem) return null
  return problem.kind === 'too-large'
    ? m.settings_avatar_too_large({ mb: Math.round(problem.maxBytes / MB) })
    : m.settings_avatar_wrong_type()
}

/** `UserProfile.locale` takes region tags (D-03 makes it the `ru` / `kk` / `en` enum). */
const profileLocales: Record<Locale, ProfileLocale> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
export const profileLocale = (locale: Locale): ProfileLocale => profileLocales[locale]

/** The appearance form: theme slug, mode and interface language. */
export const vAppearance = v.object({ theme: v.string(), mode: v.picklist(MODES), locale: v.picklist(locales) })

/**
 * The theme the picker starts on: the profile's, when it is one of the shipped themes (an unknown legacy slug is
 * never written back, BUG-365), else the one this browser shows.
 */
export const startTheme = (profileTheme: string | null | undefined, shown: string, slugs: readonly string[]) =>
  profileTheme && slugs.includes(profileTheme) ? profileTheme : shown

/** The two switches of the notifications page. An unset preference is on (the server's default). */
export type GamificationSwitches = { xpGain: boolean; showOnLeaderboard: boolean }

/**
 * The server passes stored `Profile.preferences` through as JSON (legacy rows may hold anything): read its sections
 * with the generated section schemas.
 */
export function readSwitches(preferences: { [K in keyof Profile['preferences']]?: unknown }): GamificationSwitches {
  const notifications = v.safeParse(vNotificationPreferences, preferences['notifications'])
  const privacy = v.safeParse(vPrivacyPreferences, preferences['privacy'])
  return {
    xpGain: (notifications.success ? notifications.output.xpGain : null) ?? true,
    showOnLeaderboard: (privacy.success ? privacy.output.showOnLeaderboard : null) ?? true,
  }
}

/** This device first, then the most recently seen. */
export const orderSessions = (sessions: readonly SessionSummary[]): SessionSummary[] =>
  sessions.toSorted((a, b) => Number(b.current) - Number(a.current) || b.last_seen_unix - a.last_seen_unix)

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari", Android also says "Linux".
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/YaBrowser\//, 'Yandex Browser'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iOS/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
]

/** "Chrome, Windows" from a user agent (BUG-058); null when neither part is recognized. */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const parts = [BROWSERS, SYSTEMS].flatMap(table => table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? [])
  return parts.length > 0 ? parts.join(', ') : null
}

/** A 412: the profile document was saved elsewhere after this page read it. */
export const isStale = (error: unknown): boolean => error instanceof ApiError && error.status === 412

/** An ApiError with this code. */
export const hasCode = (error: unknown, code: ApiError['code']): boolean =>
  error instanceof ApiError && error.code === code
