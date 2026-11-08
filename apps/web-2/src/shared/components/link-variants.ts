/** The looks of a link that is not a button: Link (routes) and Anchor (other URLs) share them. */
export const linkVariants = {
  /** Inline text link: the text's own ink with a quiet underline that firms up on hover (blue is for lesson links). */
  text: 'underline decoration-current/30 underline-offset-4 transition-colors duration-150 hover:decoration-current',
  /** A link that is the way on in a short sentence (sign-in, a landing step): the interface's blue. */
  accent:
    'text-link underline decoration-link/30 underline-offset-4 transition-colors duration-150 hover:decoration-link',
  /** A title in a card or row that holds other links too: the name reads as a heading, underlined on hover. */
  title: 'underline-offset-4 hover:underline',
  /** A card's title whose hit area covers the whole card (the card is `relative`); underlined on hover. */
  stretched: 'underline-offset-4 after:absolute after:inset-0 hover:underline',
  /** A rounded chip that opens a page: the home level and streak pills. */
  pill: 'flex min-h-control items-center gap-2 rounded-md border bg-card py-1 pr-3.5 pl-1.5 text-sm font-medium transition-colors duration-150 hover:bg-accent hover:text-accent-foreground [&>svg]:ml-1.5 [&>svg]:size-4',
  /** A tab that is a route: the active one carries aria-current="page". */
  tab: '-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-0.5 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground current:border-highlight current:font-medium current:text-foreground',
  /** A sidebar item of the app shell: icon + label; the current section is highlighted. */
  nav: 'relative flex min-h-control items-center gap-3 rounded-md px-3 py-1 text-sm transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground current:bg-highlight-soft current:font-medium current:text-sidebar-accent-foreground [&_svg]:size-4.5 [&_svg]:shrink-0 [&_svg]:opacity-80 current:[&_svg]:text-link current:[&_svg]:opacity-100 [&_svg]:stroke-[1.75]',
  /** A row of a section nav or a course's contents on the paper: the same anatomy as `nav`, in the page's own colours. */
  contents:
    'relative flex min-h-control items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground current:bg-accent current:font-medium current:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0',
  /**
   * A bottom-bar item on phones: icon over a label of up to two lines; long labels take the room short ones leave.
   * Below 360 px (iPhone SE 1st gen, 320) tighter letters and a narrower pill keep «Жетістіктер», «Achievements» on screen.
   */
  bar: 'flex flex-auto flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center text-xs leading-tight transition-colors duration-150 hover:text-sidebar-foreground current:font-medium current:text-sidebar-foreground max-xs:px-0.5 max-xs:tracking-tight [&_svg]:box-content [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:rounded-sm [&_svg]:px-3 max-xs:[&_svg]:px-2 [&_svg]:py-0.5 [&_svg]:stroke-[1.75] [&_svg]:transition-colors current:[&_svg]:bg-highlight-soft current:[&_svg]:text-link',
}

export type LinkVariant = keyof typeof linkVariants
