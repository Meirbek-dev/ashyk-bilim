import { useId, type ReactNode } from 'react'

import { Checkbox } from '#/shared/ui/checkbox'

/** A GFM task: a read-only checkbox named by the item's text. */
export function TaskItem({ checked, children }: { checked: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <li className="flex items-start gap-2">
      <Checkbox checked={checked} disabled aria-labelledby={id} className="mt-1.5" />
      <div id={id} className="min-w-0 flex-1">
        {children}
      </div>
    </li>
  )
}
