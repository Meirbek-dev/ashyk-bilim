import type { ComponentProps } from 'react'

import { getLocale } from '#/paraglide/runtime'
import { Progress as KitProgress } from '#/shared/ui/progress'

export { ProgressValue } from '#/shared/ui/progress'

/**
 * The kit's bar with its value text ("42 %" / "42%") in the page's language. Without `locale` ui-sdk writes English
 * into server markup and switches to the page's `lang` once the page is interactive: SSR pages would flip. kk formats
 * as ru (Chromium has no kk number data, see `formatNumber`).
 */
export function Progress(props: ComponentProps<typeof KitProgress>) {
  const locale = getLocale()
  return <KitProgress locale={locale === 'kk' ? 'ru' : locale} {...props} />
}
