/**
 * Kazakh `Intl` locale data (DECISIONS 2026-09-12).
 *
 * Some Chromium builds ship no kk CLDR data yet claim support: month names
 * come out as the raw ICU skeleton ("2026 M09 12") and numbers as "1,234.5",
 * while Node (SSR) prints "2026 ж. 12 қыр." / "1 234,5". The polyfills are
 * loaded on demand for kk only; ru/en never pay for them.
 */

/** `true` when the runtime formats kk like the root locale instead of Kazakh. */
export function needsKkIntlPolyfill(locale: string, intl: typeof Intl = globalThis.Intl): boolean {
  if (!locale.startsWith('kk')) return false
  const month = new intl.DateTimeFormat('kk-KZ', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 8, 1))
  const number = new intl.NumberFormat('kk-KZ').format(1234.5)
  return /^M\d{2}$/.test(month) || !/^1\D234,5$/.test(number)
}

let loading: Promise<void> | undefined

/**
 * Replace the runtime's `Intl.{PluralRules,NumberFormat,DateTimeFormat,
 * RelativeTimeFormat}` (and the `toLocale*String` prototypes) with formatjs
 * polyfills carrying kk data. Idempotent; one download per page load.
 */
export function loadKkIntlPolyfill(): Promise<void> {
  loading ??= (async () => {
    // Capture the browser's zone before the forced polyfill (default: UTC).
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    await import('@formatjs/intl-pluralrules/polyfill-force.js')
    await import('@formatjs/intl-pluralrules/locale-data/kk.js')
    await import('@formatjs/intl-numberformat/polyfill-force.js')
    await import('@formatjs/intl-numberformat/locale-data/kk.js')
    await import('@formatjs/intl-datetimeformat/polyfill-force.js')
    await import('@formatjs/intl-datetimeformat/locale-data/kk.js')
    await import('@formatjs/intl-datetimeformat/add-all-tz.js')
    await import('@formatjs/intl-relativetimeformat/polyfill-force.js')
    await import('@formatjs/intl-relativetimeformat/locale-data/kk.js')
    // ponytail: only kk data is loaded, so every other locale resolves to kk
    // while polyfilled — the kk UI never formats in ru/en. Add locale-data/ru
    // + en here if that changes.
    ;(Intl.DateTimeFormat as unknown as { __setDefaultTimeZone(tz: string): void }).__setDefaultTimeZone(timeZone)
    matchIcuWhitespace()
  })()
  return loading
}

/**
 * formatjs ships newer CLDR data than Node's ICU: it separates "2026 ж." with
 * U+202F (narrow no-break space) where the server prints a plain space, which
 * is a hydration mismatch on every date. Normalise the polyfill's output.
 */
function matchIcuWhitespace() {
  const proto = Intl.DateTimeFormat.prototype
  const format = Object.getOwnPropertyDescriptor(proto, 'format')
  if (format?.get) {
    const get = format.get
    Object.defineProperty(proto, 'format', {
      ...format,
      get() {
        const bound = get.call(this) as (date?: Date | number) => string
        return (date?: Date | number) => bound(date).replaceAll(' ', ' ')
      },
    })
  }
  const toParts = proto.formatToParts
  proto.formatToParts = function (date) {
    return toParts.call(this, date).map(part => ({ ...part, value: part.value.replaceAll(' ', ' ') }))
  }
}
