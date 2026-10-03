import { Suspense, type ReactNode } from 'react'

import { Table, TableBody, TableCaption, TableCell, TableHead, TableRow } from '#/shared/ui/table'

import type { ChartDatum } from './chart-data'

type ChartFigureProps = {
  title: string
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
  /** The lazy SVG chart. */
  children: ReactNode
}

/**
 * A chart with its caption and, for screen readers, every value as a table: the SVG is a picture, the numbers are
 * text (DESIGN 3, WCAG 1.1.1). The SVG loads lazily; its slot keeps the final height meanwhile.
 */
export function ChartFigure({ title, data, formatValue, children }: ChartFigureProps) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <Suspense fallback={<div aria-hidden className="h-44 rounded-md bg-muted" />}>{children}</Suspense>
      {/* Clipped, and not a scroll region: an unreachable scroller fails axe scrollable-region-focusable. */}
      <div className="sr-only [&_[data-slot=table-container]]:overflow-hidden">
        <Table>
          <TableCaption>{title}</TableCaption>
          <TableBody>
            {data.map(datum => (
              <TableRow key={datum.label}>
                <TableHead scope="row">{datum.label}</TableHead>
                <TableCell>{formatValue(datum.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </figure>
  )
}
