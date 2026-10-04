import { HeadContent, Scripts } from '@tanstack/react-router'
import { lazy, Suspense, type ReactNode } from 'react'

import { getLocale } from '#/paraglide/runtime'
import { modeAttribute, readAppearance, themeHref } from '#/shared/lib/appearance'

// Toasts follow an action of the user, never the first paint: the stock Toaster loads after the entry (budget G-05).
const Toaster = lazy(() => import('#/shared/ui/toast').then(module => ({ default: module.Toaster })))

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
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
        <Scripts />
      </body>
    </html>
  )
}
