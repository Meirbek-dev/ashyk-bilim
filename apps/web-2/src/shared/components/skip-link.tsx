import { m } from '#/paraglide/messages'

import { Anchor } from './anchor'

/** The first Tab stop of a page (WCAG 2.4.1): past the bars and navigation straight to `<main id="main">`. */
export function SkipLink() {
  return (
    <Anchor
      href="#main"
      className="fixed top-2 left-2 z-50 -translate-y-16 rounded-md border bg-popover px-3 py-2 text-sm font-medium text-popover-foreground shadow-md transition-transform duration-150 focus-visible:translate-y-0"
    >
      {m.ui_skip_to_content()}
    </Anchor>
  )
}
