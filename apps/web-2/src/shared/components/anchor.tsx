import type { ComponentProps } from 'react'

import { linkVariants, type LinkVariant } from './link-variants'

type AnchorProps = ComponentProps<'a'> & { variant?: LinkVariant }

/**
 * A URL that is not a route (a browser navigation into the API: Google sign-in, a download). A text link by default;
 * a button look only as `className={buttonVariants({ variant })}`.
 */
export function Anchor({ variant = 'text', className, children, ...props }: AnchorProps) {
  return (
    <a {...props} className={className ?? linkVariants[variant]}>
      {children}
    </a>
  )
}
