import { getLocale } from '#/paraglide/runtime'

// One zone for every date on the server and in the browser: deadlines are unambiguous and SSR matches hydration.
// Exported for APIs that bucket by calendar day (analytics `?timezone=`).
export const PLATFORM_TIME_ZONE = 'Asia/Almaty'

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
    timeZone: PLATFORM_TIME_ZONE,
  }).formatToParts(epochMs)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value
  return { year: part('year'), day: part('day'), month: KK_MONTHS[Number(part('month')) - 1] }
}

function kkDate(epochMs: number): string {
  const { year, day, month } = kkParts(epochMs)
  return `${year} ж. ${day} ${month}`
}

/**
 * A count with digit grouping, e.g. "1 295"; `signed` adds "+" to a positive one. kk groups like ru (a space), and
 * Chromium has no kk number data, so kk formats as ru.
 */
export function formatNumber(value: number, { signed = false } = {}, locale: string = getLocale()): string {
  const format = new Intl.NumberFormat(locale === 'kk' ? 'ru' : locale, { signDisplay: signed ? 'exceptZero' : 'auto' })
  return format.format(value)
}

/** A calendar date from the API's unix seconds, e.g. "2026 ж. 1 ақпан". */
export function formatDate(unixSeconds: number, locale: string = getLocale()): string {
  const epochMs = unixSeconds * 1000
  if (locale === 'kk') return kkDate(epochMs)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: PLATFORM_TIME_ZONE }).format(epochMs)
}

/** Day and month without the year, for chart axes and dense rows, e.g. "1 февр." / "Feb 1" / "1 ақпан". */
export function formatDayMonth(unixSeconds: number, locale: string = getLocale()): string {
  const epochMs = unixSeconds * 1000
  if (locale === 'kk') {
    const { day, month } = kkParts(epochMs)
    return `${day} ${month}`
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: PLATFORM_TIME_ZONE }).format(
    epochMs,
  )
}

/** A moment: date and time in the platform zone, e.g. "1 февраля 2026 г., 14:30". kk: the date table plus the time. */
export function formatDateTime(unixSeconds: number, locale: string = getLocale()): string {
  const epochMs = unixSeconds * 1000
  const time = new Intl.DateTimeFormat('ru', { timeStyle: 'short', timeZone: PLATFORM_TIME_ZONE }).format(epochMs)
  if (locale === 'kk') return `${kkDate(epochMs)}, ${time}`
  const format = { dateStyle: 'long', timeStyle: 'short', timeZone: PLATFORM_TIME_ZONE } as const
  return new Intl.DateTimeFormat(locale, format).format(epochMs)
}

/** Wall-clock parts of a moment in the platform zone. */
function zoneParts(epochMs: number) {
  const parts = new Intl.DateTimeFormat('en', {
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PLATFORM_TIME_ZONE,
  }).formatToParts(epochMs)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value ?? '00'
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

/** The value of an `<input type="datetime-local">` showing a moment in the platform zone ("2026-02-01T14:30"). */
export const toDateTimeInput = (unixSeconds: number): string => zoneParts(unixSeconds * 1000)

/** Unix seconds of a `datetime-local` value read as platform-zone wall time; null when blank or malformed. */
export function fromDateTimeInput(value: string): number | null {
  const asUtc = Date.parse(`${value}:00Z`)
  if (!value || Number.isNaN(asUtc)) return null
  // The zone's offset at that moment: the wall time it shows for the UTC reading, minus the reading.
  const offset = Date.parse(`${zoneParts(asUtc)}:00Z`) - asUtc
  return (asUtc - offset) / 1000
}

/** A share the API sends as 0..100, e.g. "42,5 %" / "42.5%"; kk formats as ru (see formatNumber). */
export function formatPercent(value: number, locale: string = getLocale()): string {
  const format = new Intl.NumberFormat(locale === 'kk' ? 'ru' : locale, { style: 'percent', maximumFractionDigits: 1 })
  return format.format(value / 100)
}
