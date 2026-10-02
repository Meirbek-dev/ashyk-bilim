import { HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { getLocale } from '#/paraglide/runtime'

/** The HTML shell. Rendered even when the root route fails, so errors keep the document intact. */
export function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
