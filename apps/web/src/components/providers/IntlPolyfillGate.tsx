'use client'

import { use } from 'react'
import { loadKkIntlPolyfill, needsKkIntlPolyfill } from '@/i18n/intl-polyfill'

// Decided once per page: `needsKkIntlPolyfill` turns false as soon as the
// polyfill is in, so re-asking it each render made the gate call `use()` on
// the suspended render and skip it on the retry («This library called use()
// to suspend in a previous render but did not call use() when it finished»).
let gate: Promise<void> | null | undefined

/**
 * Suspends hydration (the server HTML stays on screen) until the kk `Intl`
 * polyfill has loaded, so the first client render formats dates and numbers
 * exactly like the server did - no hydration mismatch, no flash of "M09".
 */
export function IntlPolyfillGate({ locale, children }: { locale: string; children: React.ReactNode }) {
  if (typeof window !== 'undefined' && locale.startsWith('kk')) {
    if (gate === undefined) gate = needsKkIntlPolyfill(locale) ? loadKkIntlPolyfill() : null
    if (gate) use(gate)
  }
  return children
}
