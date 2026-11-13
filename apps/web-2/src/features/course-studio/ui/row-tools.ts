/**
 * The looks a program row's tools share. Wide with a mouse they stay faint until the row is pointed at or holds the
 * focus, never invisible: a tool that only appears under the pointer is one an older teacher never finds. A phone and a
 * keyboard get them at full strength. The kit's icon button is sized for a page, a row's is smaller.
 */
export const QUIET =
  'transition-opacity duration-100 @3xl:pointer-fine:opacity-45 @3xl:pointer-fine:group-hover/row:opacity-100 @3xl:pointer-fine:focus-within:opacity-100'

/**
 * The drag handle: the row's first column at every width, so it stays inside the page's left edge (it hung in the
 * margin, outside the row's own hover ground) and the icons and names after it keep one line down the page. Narrow,
 * its dots stand on the page's edge (the button's own inset is taken back) and the columns are tighter: a phone's
 * name column is all the room a long chapter name has.
 */
export const HANDLE = 'shrink-0 -ms-1.5 @3xl:ms-0 [&_button]:size-7'

/** The column after the handle: a chapter's numeral, an activity's type icon. */
export const LEAD = 'w-6 @3xl:w-7'

/** What stands under the rows' names (an empty chapter's sentence): past the handle and the lead column, or the lead alone. */
export const UNDER_NAMES = 'ps-13.5 @3xl:ps-18'
export const UNDER_NAMES_FIXED = 'ps-7 @3xl:ps-9'

/** A ghost button whose icon stands under the rows' icons: past the handle, less the button's own inset. */
export const UNDER_ICONS = 'ps-5 @3xl:ps-7.5'

export const ROW_TOOLS = '[&_button]:size-9'
