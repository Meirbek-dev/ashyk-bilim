import { createLink } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

import { linkVariants, type LinkVariant } from './link-variants'

type LinkAnchorProps = Omit<ComponentProps<'a'>, 'className'> & { variant?: LinkVariant }

function LinkAnchor({ variant = 'text', children, ...props }: LinkAnchorProps) {
  // className last: the router's default activeProps ({ className: 'active' }) must not replace the look.
  return (
    <a {...props} className={linkVariants[variant]}>
      {children}
    </a>
  )
}

/**
 * A route link that is text, a tab, a sidebar item or a bottom-bar item. A link that looks like a button is the
 * router's own `Link` with `className={buttonVariants({ variant })}` from `#/shared/ui/button`.
 */
export const Link = createLink(LinkAnchor)
