import type { ReactNode } from 'react'

type DataListProps<T> = {
  items: readonly T[]
  getKey: (item: T) => string
  /** One card's content: an object's title (h2/h3), then meta lines. */
  children: (item: T) => ReactNode
}

/** Objects as a list of cards, one object per card (DESIGN 8). */
export function DataList<T>({ items, getKey, children }: DataListProps<T>) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map(item => (
        <li key={getKey(item)} className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-card-foreground">
          {children(item)}
        </li>
      ))}
    </ul>
  )
}
