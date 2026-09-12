'use client'

import { use } from 'react'
import { loadKkIntlPolyfill, needsKkIntlPolyfill } from '@/i18n/intl-polyfill'

let ready = false
const markReady = () => {
  ready = true
}

/**
 * Suspends hydration (the server HTML stays on screen) until the kk `Intl`
 * polyfill has loaded, so the first client render formats dates and numbers
 * exactly like the server did — no hydration mismatch, no flash of "M09".
 */
export function IntlPolyfillGate({ locale, children }: { locale: string; children: React.ReactNode }) {
  if (typeof window !== 'undefined' && !ready && needsKkIntlPolyfill(locale)) {
    use(loadKkIntlPolyfill().then(markReady))
  }
  return children
}
