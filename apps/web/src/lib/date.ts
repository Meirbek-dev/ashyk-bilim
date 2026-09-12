const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

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
