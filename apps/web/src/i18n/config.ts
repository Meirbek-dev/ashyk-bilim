export type Locale = (typeof locales)[number]

export const locales = ['ru-RU', 'kk-KZ', 'en-US'] as const
export const defaultLocale: Locale = 'ru-RU'
export const defaultTimeZone = 'Asia/Almaty'
export const localePrefixes = {
  'ru-RU': '/ru',
  'kk-KZ': '/kz',
  'en-US': '/en',
} as const satisfies Record<Locale, `/${string}`>
