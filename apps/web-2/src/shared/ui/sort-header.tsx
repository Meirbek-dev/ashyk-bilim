import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { nextSort, type Sort } from './data-columns'

type SortHeaderProps = {
  id: string
  label: string
  sort: Sort | undefined
  onSortChange: (sort: Sort | undefined) => void
}

/** A sortable column header: the button writes the next sort; the th carries aria-sort. */
export function SortHeader({ id, label, sort, onSortChange }: SortHeaderProps) {
  const Icon = sort?.id !== id ? ArrowUpDown : sort.desc ? ArrowDown : ArrowUp
  return (
    <button
      type="button"
      onClick={() => onSortChange(nextSort(sort, id))}
      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
    >
      {label}
      <Icon aria-hidden className="size-4" />
    </button>
  )
}
