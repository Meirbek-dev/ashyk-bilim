/**
 * The typesetting of the queue's table (the columns the stock table draws): sortable heads at the size and ink of the plain
 * ones (the stock button is `text-sm` in the ink of a control) with quiet arrows, the score (second to last) and the row's
 * action (last) at the right edge, the score's head ending where its figures do.
 */
export const TABLE_LOOK =
  '[&_thead_tr]:hover:bg-transparent [&_th]:align-middle [&_td:first-child]:ps-0 [&_th:first-child]:ps-0 [&_td:last-child]:pe-0 [&_th:last-child]:pe-0 [&_th_button]:-ml-3 [&_th_button]:text-xs [&_th_button]:font-medium [&_th_button]:text-muted-foreground [&_th_button_svg]:opacity-50 [&_td:last-child]:text-right [&_td:nth-last-child(2)]:text-right [&_th:last-child]:text-right [&_th:nth-last-child(2)]:text-right [&_th:nth-last-child(2)_button]:-mr-3'

/**
 * The results' second row: the outcome numbers in the first column of the counts above them, the distribution over the
 * other two, each under its own rule as a tile is.
 */
export const OUTCOMES = 'grid gap-x-gutter gap-y-6 @3xl:grid-cols-3 @3xl:[&>*:last-child]:col-span-2'
