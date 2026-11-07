/**
 * The typesetting of analytics tables (the columns the stock table draws): flush with the page's left edge, sortable heads at
 * the size and ink of the plain ones with quiet arrows.
 */
export const TABLE_LOOK =
  '[&_thead_tr]:hover:bg-transparent [&_th]:align-middle [&_td:first-child]:ps-0 [&_th:first-child]:ps-0 [&_td:last-child]:pe-0 [&_th:last-child]:pe-0 [&_th_button]:-ml-3 [&_th_button]:text-xs [&_th_button]:font-medium [&_th_button]:text-muted-foreground [&_th_button_svg]:opacity-50'

/** Every column after the first holds figures: they end on one line, under their head. */
export const FIGURES_AFTER_FIRST =
  '[&_td:nth-child(n+2)]:text-right [&_th:nth-child(n+2)]:text-right [&_th:nth-child(n+2)_button]:-mr-3'
