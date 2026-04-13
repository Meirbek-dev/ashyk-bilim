export type Locale = (typeof locales)[number];

export const locales = ['ru-RU', 'kk-KZ', 'en-US'] as const;
export const defaultLocale: Locale = 'ru-RU';
export const defaultTimeZone = 'Asia/Almaty';
