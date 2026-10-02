import { getLocale } from '#/paraglide/runtime'

// One zone for every date on the server and in the browser: deadlines are unambiguous and SSR matches hydration.
const PLATFORM_TIME_ZONE = 'Asia/Almaty'

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

function kkDate(epochMs: number): string {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: PLATFORM_TIME_ZONE,
  }).formatToParts(epochMs)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value
  return `${part('year')} ж. ${part('day')} ${KK_MONTHS[Number(part('month')) - 1]}`
}

/** A calendar date from the API's unix seconds, e.g. "2026 ж. 1 ақпан". */
export function formatDate(unixSeconds: number, locale: string = getLocale()): string {
  const epochMs = unixSeconds * 1000
  if (locale === 'kk') return kkDate(epochMs)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: PLATFORM_TIME_ZONE }).format(epochMs)
}
