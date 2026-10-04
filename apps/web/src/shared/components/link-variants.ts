/** The looks of a link that is not a button: Link (routes) and Anchor (other URLs) share them. */
export const linkVariants = {
  /** Inline text link: current text color, underlined (primary is never a text color). */
  text: 'underline underline-offset-4 hover:text-muted-foreground',
  /** A tab that is a route: the active one carries aria-current="page". */
  tab: 'inline-flex min-h-row shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground current:border-foreground current:text-foreground',
  /** A sidebar item of the app shell: icon + label; the current section is highlighted. */
  nav: 'flex min-h-control items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground current:bg-sidebar-accent current:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0',
  /** A bottom-bar item on phones: icon over a label of up to two lines; long labels take the room short ones leave. */
  bar: 'flex flex-auto flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center text-xs leading-tight font-medium transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground current:bg-sidebar-accent current:text-sidebar-accent-foreground [&_svg]:size-5 [&_svg]:shrink-0',
}

export type LinkVariant = keyof typeof linkVariants
