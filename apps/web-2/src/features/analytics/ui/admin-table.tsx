import type { RowData } from '@tanstack/react-table'
import { useId, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { DataColumn } from '#/shared/components/data-columns'
import { DataTable } from '#/shared/components/data-table'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

type AdminTableProps<T> = {
  title: string
  /** One line on what the ranking measures, when its numbers need it. */
  description?: string
  rows: readonly T[]
  columns: readonly DataColumn<T>[]
  getKey: (row: T) => string
}

// A ranking opens with its first rows: five rankings of 25 made a wall of tables (13 000 px on a phone).
const FIRST = 8

/** One ranking of the admin overview: its heading and table, or one sentence when there is nothing yet. */
export function AdminTable<T extends RowData>({ title, description, rows, columns, getKey }: AdminTableProps<T>) {
  const headingId = useId()
  const [all, setAll] = useState(false)
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-xl font-semibold">
          {title}
        </h2>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <ListState
        pending={false}
        error={null}
        count={rows.length}
        filtered={false}
        emptyText={m.analytics_admin_empty()}
        onRetry={() => undefined}
      >
        <DataTable label={title} rows={all ? rows : rows.slice(0, FIRST)} columns={columns} getKey={getKey} />
        <ShowMore hasMore={!all && rows.length > FIRST} pending={false} onMore={() => setAll(true)} />
      </ListState>
    </section>
  )
}
