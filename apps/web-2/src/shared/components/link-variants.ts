/** The looks of a link that is not a button: Link (routes) and Anchor (other URLs) share them. */
export const linkVariants = {
  /** Inline text link: current text color, underlined (primary is never a text color). */
  text: 'underline underline-offset-4 hover:text-muted-foreground',
  /** A title in a card or row that holds other links too: the name reads as a heading, underlined on hover. */
  title: 'underline-offset-4 hover:underline',
  /** A card's title whose hit area covers the whole card (the card is `relative`); underlined on hover. */
  stretched: 'underline-offset-4 after:absolute after:inset-0 hover:underline',
  /** A rounded chip that opens a page: the home level and streak pills. */
  pill: 'flex min-h-control items-center gap-2 rounded-full border bg-card py-1 pr-4 pl-1.5 text-sm font-medium shadow-xs transition-colors duration-150 hover:bg-accent hover:text-accent-foreground [&>svg]:ml-1.5 [&>svg]:size-4',
  /** A tab that is a route: the active one carries aria-current="page". */
  tab: 'inline-flex min-h-row shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground current:border-foreground current:text-foreground',
  /** A sidebar item of the app shell: icon + label; the current section is highlighted. */
  nav: 'relative flex min-h-control items-center gap-3 rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-transparent before:transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground current:bg-sidebar-accent current:font-semibold current:text-sidebar-accent-foreground current:before:bg-sidebar-primary [&_svg]:size-4 [&_svg]:shrink-0',
  /** A bottom-bar item on phones: icon over a label of up to two lines; long labels take the room short ones leave. */
  bar: 'flex flex-auto flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center text-xs leading-tight font-medium transition-colors duration-150 hover:text-sidebar-accent-foreground current:font-semibold current:text-sidebar-accent-foreground [&_svg]:box-content [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:rounded-full [&_svg]:px-3 [&_svg]:py-0.5 [&_svg]:transition-colors current:[&_svg]:bg-sidebar-accent',
}

export type LinkVariant = keyof typeof linkVariants
