import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { Button } from '#/shared/ui/button'

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
    <Button variant="ghost" size="sm" onClick={() => onSortChange(nextSort(sort, id))}>
      {label}
      <Icon aria-hidden data-icon="inline-end" />
    </Button>
  )
}
