import type { ReactNode } from 'react'

type DataListProps<T> = {
  items: readonly T[]
  getKey: (item: T) => string
  /** `cards`: one card per object (DESIGN 8); `rows`: hairline-separated rows on the page itself, for short feeds. */
  variant?: 'cards' | 'rows'
  /** One card's content: an object's title (h2/h3), then meta lines. */
  children: (item: T) => ReactNode
}

const looks = {
  cards: {
    list: 'flex flex-col gap-3',
    item: 'relative flex flex-col gap-1 rounded-lg border bg-card p-4 text-card-foreground',
  },
  rows: {
    list: 'flex flex-col divide-y border-y',
    item: 'relative flex flex-col gap-1 py-3.5',
  },
}

/** Objects as a list of cards, or as rows of one panel; each item holds a `stretched` link of its own. */
export function DataList<T>({ items, getKey, variant = 'cards', children }: DataListProps<T>) {
  const look = looks[variant]
  return (
    <ul className={look.list}>
      {items.map(item => (
        <li key={getKey(item)} className={look.item}>
          {children(item)}
        </li>
      ))}
    </ul>
  )
}
