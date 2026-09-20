const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/** One timestamp style for dashboard rows and journals (`14 қыр., 22:20`), whatever the surface (UX-096). */
export const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
}

/** Medium date + short time (`20 қыр. 2026 ж., 22:03`) for attempt/submission stamps (UX-149). */
export const DATE_TIME_LONG_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

/**
 * Locale-aware `d MMM y` date for UI badges. `locale` is the app locale
 * (`ru-RU`, `kk-KZ`, `en-US`); invalid input renders as ''. Browsers without
 * kk CLDR data are polyfilled before the first client render
 * (`@/i18n/intl-polyfill`), so kk goes through `Intl` like every other locale.
 */
export function formatDate(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_OPTIONS,
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, options).format(date)
}
