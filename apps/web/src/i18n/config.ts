export type Locale = (typeof locales)[number]

export const locales = ['ru-RU', 'kk-KZ', 'en-US'] as const
export const defaultLocale: Locale = 'ru-RU'
/** The platform's zone, for APIs that bucket by calendar day (analytics `timezone`; the server's tzdata is current). */
export const defaultTimeZone = 'Asia/Almaty'
/**
 * The zone every date is formatted in (next-intl, server and client): the platform's fixed UTC+5. Not the
 * 'Asia/Almaty' name: Kazakhstan moved to UTC+5 in March 2024 and browsers with older tzdata (Linux WebKit on
 * system ICU 74, older iOS/Safari) still put it at UTC+6 - an hour off, and a day off in the evening (a hydration
 * mismatch too). 'Etc/GMT-5' is UTC+5 in every tzdata (POSIX sign: minus is east).
 */
export const formatTimeZone = 'Etc/GMT-5'
export const localePrefixes = {
  'ru-RU': '/ru',
  'kk-KZ': '/kz',
  'en-US': '/en',
} as const satisfies Record<Locale, `/${string}`>

/** The AI `language` for a UI locale - the active locale, never `auto` (UX-037: a ru-RU account on /kz wants Kazakh). */
export function aiLanguageFor(locale: string): 'ru' | 'kk' | 'en' {
  if (locale.startsWith('kk')) return 'kk'
  if (locale.startsWith('en')) return 'en'
  return 'ru'
}
