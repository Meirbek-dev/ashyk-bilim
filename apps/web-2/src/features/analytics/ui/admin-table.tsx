import type { RowData } from '@tanstack/react-table'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { DataColumn } from '#/shared/ui/data-columns'
import { DataTable } from '#/shared/ui/data-table'
import { ListState } from '#/shared/ui/list-state'

type AdminTableProps<T> = {
  title: string
  rows: readonly T[]
  columns: readonly DataColumn<T>[]
  getKey: (row: T) => string
}

/** One ranking of the admin overview: its heading and table, or one sentence when there is nothing yet. */
export function AdminTable<T extends RowData>({ title, rows, columns, getKey }: AdminTableProps<T>) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-xl font-semibold">
        {title}
      </h2>
      <ListState
        pending={false}
        error={null}
        count={rows.length}
        filtered={false}
        emptyText={m.analytics_admin_empty()}
        onRetry={() => undefined}
      >
        <DataTable label={title} rows={rows} columns={columns} getKey={getKey} />
      </ListState>
    </section>
  )
}
