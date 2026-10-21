import { getLocale } from '#/paraglide/runtime'

// The platform's zone, for APIs that bucket by calendar day (analytics `?timezone=`; the server's tzdata is current).
export const PLATFORM_TIME_ZONE = 'Asia/Almaty'

// Every date shown, on the server and in the browser, is formatted at the platform's fixed offset: deadlines are
// unambiguous and SSR matches hydration. Not by the 'Asia/Almaty' name: Kazakhstan moved to UTC+5 in March 2024,
// and a browser with older tzdata (Linux WebKit on system ICU 74, older iOS/Safari) still puts it at UTC+6, an hour
// and in the evening a day off. 'Etc/GMT-5' is UTC+5 in every tzdata (POSIX sign: minus is east).
const FORMAT_TIME_ZONE = 'Etc/GMT-5'

// Chromium ships no kk ICU data (it prints "2026 M02 1"), Node does: kk dates come from this table on
// both sides so SSR and hydration agree (spec 12, Ф0 fallback; DECISIONS.md "Web (stage 2)").
const KK_MONTHS = [
  'қаңтар',
  'ақпан',
  'наурыз',
  'сәуір',
  'мамыр',
  'маусым',
  'шілде',
  'тамыз',
  'қыркүйек',
  'қазан',
  'қараша',
  'желтоқсан',
]

function kkParts(epochMs: number) {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: FORMAT_TIME_ZONE,
  }).formatToParts(epochMs)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value
  return { year: part('year'), day: part('day'), month: KK_MONTHS[Number(part('month')) - 1] }
}

function kkDate(epochMs: number, withYear: boolean): string {
  const { year, day, month } = kkParts(epochMs)
  return withYear ? `${year} ж. ${day} ${month}` : `${day} ${month}`
}

/**
 * A count with digit grouping, e.g. "1 295"; `signed` adds "+" to a positive one. kk groups like ru (a space), and
 * Chromium has no kk number data, so kk formats as ru.
 */
export function formatNumber(value: number, { signed = false } = {}, locale: string = getLocale()): string {
  const format = new Intl.NumberFormat(locale === 'kk' ? 'ru' : locale, { signDisplay: signed ? 'exceptZero' : 'auto' })
  return format.format(value)
}

/**
 * A calendar date from the API's unix seconds. The year only when it is not this year («14 октября», «3 марта 2025 г.»,
 * "2025 ж. 3 наурыз"), as every list and meta line reads better without «2026 г.»; `withYear` for formal records
 * (a certificate's issue date).
 */
export function formatDate(unixSeconds: number, locale: string = getLocale(), { withYear = false } = {}): string {
  const epochMs = unixSeconds * 1000
  const year = withYear || platformParts(epochMs).year !== platformParts(Date.now()).year
  if (locale === 'kk') return kkDate(epochMs, year)
  const style = year ? ({ dateStyle: 'long' } as const) : ({ day: 'numeric', month: 'long' } as const)
  return new Intl.DateTimeFormat(locale, { ...style, timeZone: FORMAT_TIME_ZONE }).format(epochMs)
}

/** Day and month without the year, for chart axes and dense rows, e.g. "1 февр." / "Feb 1" / "1 ақпан". */
export function formatDayMonth(unixSeconds: number, locale: string = getLocale()): string {
  const epochMs = unixSeconds * 1000
  if (locale === 'kk') {
    const { day, month } = kkParts(epochMs)
    return `${day} ${month}`
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: FORMAT_TIME_ZONE }).format(epochMs)
}

/** Wall-clock parts of an instant in the platform zone, zero-padded, 24 h. */
function platformParts(epochMs: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: FORMAT_TIME_ZONE,
  }).formatToParts(epochMs)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value ?? ''
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') }
}

/** A date with its time of day (deadlines, hand-ins), e.g. "1 февраля 2026 г., 01:30" / "2026 ж. 1 ақпан, 01:30". */
export function formatDateTime(unixSeconds: number, locale: string = getLocale()): string {
  const { hour, minute } = platformParts(unixSeconds * 1000)
  return `${formatDate(unixSeconds, locale)}, ${hour}:${minute}`
}

/** The `<input type="datetime-local">` value of an instant, as the platform zone reads it. */
export function toDateTimeInput(unixSeconds: number): string {
  const { year, month, day, hour, minute } = platformParts(unixSeconds * 1000)
  return `${year}-${month}-${day}T${hour}:${minute}`
}

/** The instant (unix seconds) a `datetime-local` value names in the platform zone, whatever the browser's zone. */
export function fromDateTimeInput(value: string): number {
  const asUtc = Date.parse(`${value}:00Z`) / 1000
  const offset = Date.parse(`${toDateTimeInput(asUtc)}:00Z`) / 1000 - asUtc
  return asUtc - offset
}

/** A share the API sends as 0..100, e.g. "42,5 %" / "42.5%"; kk formats as ru (see formatNumber). */
export function formatPercent(value: number, locale: string = getLocale()): string {
  const format = new Intl.NumberFormat(locale === 'kk' ? 'ru' : locale, { style: 'percent', maximumFractionDigits: 1 })
  return format.format(value / 100)
}

const FILE_UNITS = [
  ['gigabyte', 1024 ** 3],
  ['megabyte', 1024 ** 2],
  ['kilobyte', 1024],
] as const

/** A file size in the largest fitting unit, e.g. "2 ГБ" / "450,5 МБ" / "2 GB"; kk formats as ru (see formatNumber). */
export function formatFileSize(bytes: number, locale: string = getLocale()): string {
  const [unit, size] = FILE_UNITS.find(([, step]) => bytes >= step) ?? ['byte', 1]
  const format = new Intl.NumberFormat(locale === 'kk' ? 'ru' : locale, {
    style: 'unit',
    unit,
    maximumFractionDigits: 1,
  })
  return format.format(bytes / size)
}
