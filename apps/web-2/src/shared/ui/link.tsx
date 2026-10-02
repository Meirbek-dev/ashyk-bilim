import { createLink } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

import { buttonVariants } from './button'

const variants = {
  /** Inline text link: current text color, underlined (primary is never a text color). */
  text: 'underline underline-offset-4 hover:text-muted-foreground',
  /** A tab that is a route: the active one carries aria-current="page". */
  tab: 'inline-flex min-h-row shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground current:border-foreground current:text-foreground',
  /** A sidebar item of the app shell: icon + label; the current section is highlighted. */
  nav: 'flex min-h-control items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground current:bg-sidebar-accent current:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0',
  /** A bottom-bar item on phones: icon over a short label. */
  bar: 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground current:bg-sidebar-accent current:text-sidebar-accent-foreground [&_svg]:size-5 [&_svg]:shrink-0',
  primary: buttonVariants({ variant: 'primary' }),
  secondary: buttonVariants({ variant: 'secondary' }),
  outline: buttonVariants({ variant: 'outline' }),
  ghost: buttonVariants({ variant: 'ghost' }),
}

type AnchorProps = Omit<ComponentProps<'a'>, 'className'> & { variant?: keyof typeof variants }

/** Kit looks for a URL that is not a route (a browser navigation into the API, e.g. Google sign-in); routes use Link. */
export function Anchor({ variant = 'text', children, ...props }: AnchorProps) {
  // className last: the router's default activeProps ({ className: 'active' }) must not replace the kit look.
  return (
    <a {...props} className={variants[variant]}>
      {children}
    </a>
  )
}

/** The router Link with kit looks: `variant` = text (default), tab, or a button look for navigation. */
export const Link = createLink(Anchor)
