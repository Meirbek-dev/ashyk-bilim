import { HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { getLocale } from '#/paraglide/runtime'
import { modeAttribute, readAppearance, themeHref } from '#/shared/lib/appearance'
import { Toaster } from '#/shared/ui/toaster'

/**
 * The HTML shell. Rendered even when the root route fails, so errors keep the document intact.
 * Theme and mode come from cookies during SSR: the first paint has the right colors, no script needed.
 */
export function RootDocument({ children }: { children: ReactNode }) {
  const { theme, mode } = readAppearance()
  return (
    <html lang={getLocale()} data-theme={theme} data-mode={modeAttribute(mode)}>
      <head>
        <HeadContent />
        <link rel="stylesheet" href={themeHref(theme)} />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
