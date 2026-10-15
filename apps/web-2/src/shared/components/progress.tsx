import type { ComponentProps } from 'react'

import { getLocale } from '#/paraglide/runtime'
import { Progress as KitProgress } from '#/shared/ui/progress'

export { ProgressValue } from '#/shared/ui/progress'

/**
 * The kit's bar with its value text ("42 %" / "42%") in the page's language. Without `locale` Base UI formats in the
 * runtime's default one, which differs between the server and the browser: a hydration mismatch on SSR pages. kk
 * formats as ru (Chromium has no kk number data, see `formatNumber`).
 */
export function Progress(props: ComponentProps<typeof KitProgress>) {
  const locale = getLocale()
  return <KitProgress locale={locale === 'kk' ? 'ru' : locale} {...props} />
}
