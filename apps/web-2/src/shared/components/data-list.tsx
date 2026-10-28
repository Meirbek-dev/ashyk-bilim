import type { ReactNode } from 'react'

type DataListProps<T> = {
  items: readonly T[]
  getKey: (item: T) => string
  /** `cards`: one card per object (DESIGN 8); `rows`: one panel, a row per object, for short feeds. */
  variant?: 'cards' | 'rows'
  /** One card's content: an object's title (h2/h3), then meta lines. */
  children: (item: T) => ReactNode
}

const looks = {
  cards: {
    list: 'flex flex-col gap-3',
    item: 'relative flex flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground shadow-xs',
  },
  rows: {
    list: 'flex flex-col divide-y overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs',
    item: 'relative flex flex-col gap-1 p-4',
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
