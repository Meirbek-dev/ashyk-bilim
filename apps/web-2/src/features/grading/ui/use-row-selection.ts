import { useState } from 'react'

import type { QueueRow } from '../model/queue'

/** The queue's chosen rows (B-GRD-08, B-GRD-09, B-GRD-42): ids, kept across «Показать ещё» pages. */
export function useRowSelection(rows: readonly QueueRow[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const picked = rows.filter(row => selected.has(row.id))
  const all = rows.length > 0 && picked.length === rows.length
  const select = (ids: readonly string[]) => setSelected(new Set(ids))
  return {
    picked,
    all,
    select,
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected(prev => {
        const next = new Set(prev)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    /** Every loaded row is selected: the header checkbox then clears the choice, else selects them all. */
    toggleAll: () => select(all ? [] : rows.map(row => row.id)),
  }
}
