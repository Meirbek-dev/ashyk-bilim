import { Fragment, type ReactNode } from 'react'

import type { DataColumn } from './data-columns'
import { DataList } from './data-list'

const isBlank = (value: ReactNode) => value === null || value === undefined || value === false || value === ''

type DataTableCardsProps<T> = { rows: readonly T[]; columns: readonly DataColumn<T>[]; getKey: (row: T) => string }

/**
 * DataTable at narrow width: one card per row, the first priority 1 column as the title, further priority 1 columns
 * as lines under it (the learner of a work item), priority 2 as labelled lines, the action column last.
 */
export function DataTableCards<T>({ rows, columns, getKey }: DataTableCardsProps<T>) {
  const [title, ...subtitles] = columns.filter(column => column.priority === 1 && !column.action && !column.select)
  const select = columns.find(column => column.select && column.priority !== 3)
  const lines = columns.filter(column => column.priority === 2 && !column.action && !column.select)
  const actions = columns.filter(column => column.priority !== 3 && column.action)
  return (
    <DataList items={rows} getKey={getKey}>
      {row => (
        <>
          {select ? (
            <div className="flex items-start gap-3">
              <div className="pt-0.5">{select.cell(row)}</div>
              {title ? <h3 className="min-w-0 flex-1 font-medium">{title.cell(row)}</h3> : null}
            </div>
          ) : title ? (
            <h3 className="font-medium">{title.cell(row)}</h3>
          ) : null}
          {subtitles.map(column => (
            <p key={column.id} className="text-sm">
              {column.cell(row)}
            </p>
          ))}
          {lines.length > 0 ? (
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {/* A label too long for the line goes whole and its value under it at the left, as after a short
                  label; without the wrap the value hung at the far right (gradebook columns named by long activities). */}
              {lines.map(column => {
                // A cell with nothing to say leaves its label out too: a bare «Описание» or «Модель» read as broken.
                const value = column.cell(row)
                return isBlank(value) ? null : (
                  <div key={column.id} className="flex flex-wrap gap-x-1">
                    <dt className="text-muted-foreground">{column.header}</dt>
                    <dd>{value}</dd>
                  </div>
                )
              })}
            </dl>
          ) : null}
          {actions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {actions.map(column => (
                <Fragment key={column.id}>{column.cell(row)}</Fragment>
              ))}
            </div>
          ) : null}
        </>
      )}
    </DataList>
  )
}
