/**
 * The looks a program row's tools share. Wide with a mouse they stay out of the way until the row is pointed at or
 * holds the focus; a phone and a keyboard always get them. The kit's icon button is sized for a page, a row's is smaller.
 */
export const QUIET =
  'transition-opacity duration-100 @3xl:pointer-fine:opacity-0 @3xl:pointer-fine:group-hover/row:opacity-100 @3xl:pointer-fine:focus-within:opacity-100'

/** The drag handle: in the row while narrow, hanging in the page's margin once there is one. */
export const HANDLE = '[&_button]:size-7 @3xl:absolute @3xl:-start-8 @3xl:top-1/2 @3xl:-translate-y-1/2'

export const ROW_TOOLS = '[&_button]:size-8'
