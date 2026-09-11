// ponytail: some Chromium builds ship no Kazakh month names and print the raw ICU
// skeleton ("2026 M09 11") — and Node does have them, so SSR/CSR disagree.
// Kazakh is therefore composed by hand from CLDR's "d MMM y 'ж'." pattern.
const KK_MONTHS_SHORT = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.']

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/**
 * Locale-aware `d MMM y` date for UI badges. `locale` is the app locale
 * (`ru-RU`, `kk-KZ`, `en-US`); invalid input renders as ''.
 */
export function formatDate(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_OPTIONS,
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  if (!locale.startsWith('kk')) return new Intl.DateTimeFormat(locale, options).format(date)

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { ...options, day: 'numeric', month: 'numeric', year: 'numeric' })
      .formatToParts(date)
      .map(part => [part.type, part.value]),
  )
  return `${parts.day} ${KK_MONTHS_SHORT[Number(parts.month) - 1]} ${parts.year} ж.`
}
