export type Locale = (typeof locales)[number]

export const locales = ['ru-RU', 'kk-KZ', 'en-US'] as const
export const defaultLocale: Locale = 'ru-RU'
export const defaultTimeZone = 'Asia/Almaty'
export const localePrefixes = {
  'ru-RU': '/ru',
  'kk-KZ': '/kz',
  'en-US': '/en',
} as const satisfies Record<Locale, `/${string}`>

/** The AI `language` for a UI locale — the active locale, never `auto` (UX-037: a ru-RU account on /kz wants Kazakh). */
export function aiLanguageFor(locale: string): 'ru' | 'kk' | 'en' {
  if (locale.startsWith('kk')) return 'kk'
  if (locale.startsWith('en')) return 'en'
  return 'ru'
}
