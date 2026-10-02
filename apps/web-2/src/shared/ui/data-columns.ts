import type { ReactNode } from 'react'

export type DataColumn<T> = {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** Narrow width: 1 = the card's title, 2 = a labelled line on the card, 3 = table only. */
  priority: 1 | 2 | 3
  sortable?: boolean
}

export type Sort = { id: string; desc: boolean }

/** Header click cycle: ascending, descending, then back to the list's default order. */
export const nextSort = (current: Sort | undefined, id: string): Sort | undefined =>
  current?.id !== id ? { id, desc: false } : current.desc ? undefined : { id, desc: true }
