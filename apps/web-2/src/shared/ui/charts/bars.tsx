import { lazy } from 'react'

import type { ChartDatum } from './chart-data'
import { ChartFigure } from './chart-figure'

const BarsSvg = lazy(() => import('./bars-svg').then(module => ({ default: module.BarsSvg })))

type BarsProps = {
  title: string
  /** One bar per category, in display order. */
  data: readonly ChartDatum[]
  formatValue: (value: number) => string
}

/** Counts per category: a bar chart plus its values as text. */
export function Bars({ title, data, formatValue }: BarsProps) {
  return (
    <ChartFigure title={title} data={data} formatValue={formatValue}>
      <BarsSvg label={title} data={data} formatValue={formatValue} />
    </ChartFigure>
  )
}
